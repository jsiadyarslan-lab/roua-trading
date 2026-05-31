import Foundation
import AuthenticationServices
import UIKit

// MARK: - Auth Service
@MainActor
class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: AuthUser?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = APIClient.shared
    private let keychain = KeychainManager.shared

    private init() {}

    // MARK: - Check Existing Session (with retry)
    func checkExistingSession() {
        guard keychain.sessionToken != nil else { return }
        Task { await validateSessionWithRetry() }
    }

    func validateSessionWithRetry(maxAttempts: Int = 3) async {
        for attempt in 1...maxAttempts {
            do {
                let response: AuthVerifyResponse = try await api.request("/auth/me")
                if response.success, let user = response.user {
                    self.currentUser = user
                    self.isAuthenticated = true
                    self.errorMessage = nil
                    print("[Auth] Session validated for \(user.email)")
                    return
                } else {
                    self.isAuthenticated = false
                    self.errorMessage = "فشل التحقق من الجلسة"
                }
            } catch {
                print("[Auth] Validation attempt \(attempt)/\(maxAttempts) failed: \(error.localizedDescription)")
                if attempt < maxAttempts {
                    try? await Task.sleep(nanoseconds: UInt64(attempt) * 1_500_000_000)
                } else {
                    self.isAuthenticated = false
                    self.errorMessage = "فشل التحقق من الجلسة بعد \(maxAttempts) محاولات"
                }
            }
        }
    }

    // MARK: - Google OAuth via ASWebAuthenticationSession
    func signInWithGoogle() async {
        isLoading = true
        errorMessage = nil

        guard let authURL = URL(string: "\(APIConfig.baseURL)/auth/signin/google?app_redirect_uri=roua://auth/callback") else {
            errorMessage = "رابط المصادقة غير صالح"
            isLoading = false
            return
        }

        do {
            let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
                let session = ASWebAuthenticationSession(
                    url: authURL,
                    callbackURLScheme: "roua"
                ) { url, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let url = url {
                        continuation.resume(returning: url)
                    } else {
                        continuation.resume(throwing: APIError.networkError("No callback URL received"))
                    }
                }
                session.prefersEphemeralWebBrowserSession = false
                session.presentationContextProvider = Self.shared
                session.start()
            }

            // Parse callback URL: roua://auth/callback?token=xxx&refresh=yyy&userId=zzz
            guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                  let queryItems = components.queryItems else {
                errorMessage = "استجابة المصادقة غير صالحة"
                isLoading = false
                return
            }

            let token = queryItems.first(where: { $0.name == "token" })?.value
            let refresh = queryItems.first(where: { $0.name == "refresh" })?.value
            let userId = queryItems.first(where: { $0.name == "userId" })?.value

            guard let token = token else {
                errorMessage = "لم يتم استلام رمز المصادقة"
                isLoading = false
                return
            }

            // Save session
            api.sessionToken = token
            keychain.saveSession(token: token, refresh: refresh, userId: userId)

            // Validate the session to get user info
            await validateSessionWithRetry()
            isLoading = false

        } catch {
            print("[Auth] Google OAuth error: \(error.localizedDescription)")
            if error.localizedDescription.contains("canceled") {
                // User canceled — don't show error
            } else {
                errorMessage = "فشل تسجيل الدخول: \(error.localizedDescription)"
            }
            isLoading = false
        }
    }

    // MARK: - Email Login (WebAuthn flow)
    func loginWithEmail(email: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // Step 1: Get challenge
            let challengeData: Data = try await api.rawDataRequest("/auth/challenge?email=\(email)")

            // Step 2: Parse challenge
            guard let json = try? JSONSerialization.jsonObject(with: challengeData) as? [String: Any],
                  let challenge = json["challenge"] as? String else {
                errorMessage = "فشل الحصول على تحدي المصادقة"
                isLoading = false
                return
            }

            // Step 3: WebAuthn ceremony would go here
            // For now, show error that WebAuthn is not yet available on this device
            errorMessage = "تسجيل الدخول بالبريد يتطلب WebAuthn — يرجى استخدام Google Sign In"
            isLoading = false

        } catch {
            print("[Auth] Email login error: \(error.localizedDescription)")
            errorMessage = "فشل تسجيل الدخول: \(error.localizedDescription)"
            isLoading = false
        }
    }

    // MARK: - Logout
    func logout() async {
        do {
            let _: Data = try await api.rawDataRequest("/auth/me", method: "DELETE")
            print("[Auth] Server session deleted")
        } catch {
            // Log but don't block — clear local session regardless
            print("[Auth] Server logout failed (clearing local anyway): \(error.localizedDescription)")
        }

        // Always clear local state
        keychain.clearSession()
        api.sessionToken = nil
        currentUser = nil
        isAuthenticated = false
        errorMessage = nil
        print("[Auth] Local session cleared")
    }

    // MARK: - Biometric Unlock (Face ID / Touch ID)
    func biometricUnlock() async -> Bool {
        // TODO: Implement LAContext for Face ID / Touch ID
        // This will check if there's a valid session and unlock with biometrics
        return keychain.sessionToken != nil
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding
extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first as? UIWindowScene
        return windowScene?.windows.first ?? ASPresentationAnchor()
    }
}
