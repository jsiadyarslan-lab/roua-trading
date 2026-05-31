import Foundation

// MARK: - API Client with Retry + Error Handling
@MainActor
class APIClient {
    static let shared = APIClient()
    private let session: URLSession
    private let decoder = JSONDecoder()

    var sessionToken: String? {
        get { KeychainManager.shared.sessionToken }
        set {
            if let v = newValue {
                KeychainManager.shared.set(key: "roua_session", value: v)
            } else {
                KeychainManager.shared.delete(key: "roua_session")
            }
        }
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = APIConfig.requestTimeout
        config.httpShouldSetCookies = false
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        self.decoder.keyDecodingStrategy = .useDefaultKeys
    }

    // MARK: - Core Request with Retry
    func request<T: Codable>(_ path: String, method: String = "GET", body: (any Encodable)? = nil, retryCount: Int = 0) async throws -> T {
        guard let url = URL(string: "\(APIConfig.baseURL)\(path)") else {
            throw APIError.networkError("Invalid URL: \(path)")
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("RouaTrading/2.0 (iOS; Mobile)", forHTTPHeaderField: "User-Agent")

        if let token = sessionToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue(token, forHTTPHeaderField: APIConfig.sessionHeader)
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            // Network-level error — retry if we have retries left
            if retryCount < APIConfig.maxRetryCount {
                print("[API] Request failed, retrying (\(retryCount + 1)/\(APIConfig.maxRetryCount)): \(path)")
                try await Task.sleep(nanoseconds: APIConfig.retryDelay * UInt64(retryCount + 1))
                return try await request(path, method: method, body: body, retryCount: retryCount + 1)
            }
            throw APIError.networkError(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError("Invalid response type")
        }

        // Handle 401 Unauthorized
        if http.statusCode == 401 {
            // Try refresh token once before giving up
            if retryCount == 0, let refreshToken = KeychainManager.shared.refreshToken {
                print("[API] 401 received, attempting token refresh...")
                do {
                    let refreshed = try await refreshSession(refreshToken: refreshToken)
                    if refreshed {
                        return try await request(path, method: method, body: body, retryCount: 1)
                    }
                } catch {
                    print("[API] Token refresh failed: \(error.localizedDescription)")
                }
            }
            throw APIError.unauthorized
        }

        // Handle server errors
        guard (200...299).contains(http.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown"
            print("[API] Error \(http.statusCode) on \(method) \(path): \(errorBody)")
            if retryCount < APIConfig.maxRetryCount && http.statusCode >= 500 {
                try await Task.sleep(nanoseconds: APIConfig.retryDelay * UInt64(retryCount + 1))
                return try await request(path, method: method, body: body, retryCount: retryCount + 1)
            }
            throw APIError.serverError(http.statusCode, errorBody)
        }

        // Decode response
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            // Try unwrapping { success, data } wrapper
            let unwrapped = unwrapResponse(data)
            do {
                return try decoder.decode(T.self, from: unwrapped)
            } catch let decodeError {
                print("[API] Decoding failed for \(path): \(decodeError)")
                print("[API] Response was: \(String(data: data, encoding: .utf8)?.prefix(500) ?? "nil")")
                throw APIError.decodingError(decodeError.localizedDescription)
            }
        }
    }

    // MARK: - Unwrap { success, data } wrapper
    private func unwrapResponse(_ data: Data) -> Data {
        guard let wrapper = try? decoder.decode(ApiResponseWrapper.self, from: data),
              wrapper.success == true,
              let innerData = wrapper.data else { return data }
        return (try? JSONEncoder().encode(innerData)) ?? data
    }

    // MARK: - Session Refresh
    private func refreshSession(refreshToken: String) async throws -> Bool {
        guard let url = URL(string: "\(APIConfig.baseURL)/auth/refresh") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(refreshToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            return false
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let success = json["success"] as? Bool, success,
           let tokenData = json["data"] as? [String: Any] {
            if let newToken = tokenData["token"] as? String {
                KeychainManager.shared.set(key: "roua_session", value: newToken)
            }
            if let newRefresh = tokenData["refresh"] as? String {
                KeychainManager.shared.set(key: "roua_refresh", value: newRefresh)
            }
            return true
        }
        return false
    }

    // MARK: - Raw Data Request (for non-decodable responses)
    func rawDataRequest(_ path: String, method: String = "GET", body: (any Encodable)? = nil) async throws -> Data {
        guard let url = URL(string: "\(APIConfig.baseURL)\(path)") else {
            throw APIError.networkError("Invalid URL: \(path)")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = sessionToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue(token, forHTTPHeaderField: APIConfig.sessionHeader)
        }
        if let body { req.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.networkError("Invalid response") }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.serverError(http.statusCode, String(data: data, encoding: .utf8) ?? "Unknown")
        }
        return data
    }
}
