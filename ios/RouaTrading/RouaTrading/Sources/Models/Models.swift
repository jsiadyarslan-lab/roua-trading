import Foundation

// MARK: - Auth Models
struct AuthUser: Codable {
    let id: String
    let email: String
    let displayName: String?
    let tier: String
}

struct AuthVerifyResponse: Codable {
    let success: Bool
    let user: AuthUser?
}

struct AuthRegisterRequest: Codable {
    let email: String
    let displayName: String?
}

struct GoogleAuthCallback: Codable {
    let token: String
    let refresh: String?
    let userId: String?
}

// MARK: - Market Data Models
struct Quote: Codable {
    let symbol: String
    let bid: Double?
    let ask: Double?
    let last: Double?
    let open: Double?
    let high: Double?
    let low: Double?
    let close: Double?
    let volume: Double?
    let change: Double?
    let changePercent: Double?
    let timestamp: String?
}

struct CandleData: Codable, Identifiable {
    var id: TimeInterval { time }
    let time: TimeInterval
    let open: Double
    let high: Double
    let low: Double
    let close: Double
    let volume: Double
}

// MARK: - Trading Models
struct Position: Codable, Identifiable {
    let id: String
    let userId: String
    let credentialId: String
    let symbol: String
    let side: String
    let status: String
    let entryPrice: Double
    let currentPrice: Double?
    let quantity: Double
    let unrealizedPnl: Double?
    let realizedPnl: Double?
    let stopLoss: Double?
    let takeProfit: Double?
    let source: String?
    let createdAt: String
    let updatedAt: String
}

struct Trade: Codable, Identifiable {
    let id: String
    let symbol: String
    let side: String
    let type: String
    let quantity: Double
    let price: Double
    let pnl: Double?
    let createdAt: String
}

struct PortfolioSummary: Codable {
    let totalValue: Double
    let totalPnl: Double
    let dailyPnl: Double
    let positions: [Position]?
    let unrealizedPnl: Double?
    let realizedPnl: Double?
}

struct PlaceOrderRequest: Codable {
    let exchangeCredentialId: String
    let symbol: String
    let side: String
    let type: String
    let quantity: Double
    let price: Double?
    let stopLoss: Double
    let takeProfit: Double?
    let idempotencyKey: String
    let clientOrderId: String?
}

struct V2PlaceOrderResponse: Codable {
    let success: Bool
    let data: V2OrderData
}

struct V2OrderData: Codable {
    let orderId: String
    let status: String
    let idempotencyKey: String
    let riskScore: Double?
}

// MARK: - Scanner Models
struct ScanResult: Codable, Identifiable {
    let id: String?
    let symbol: String
    let name: String?
    let price: Double
    let change: Double
    let changePercent: Double
    let volume: Double?
    let signal: String?
}

struct HeatmapItem: Codable, Identifiable {
    var id: String { symbol }
    let symbol: String
    let name: String?
    let change: Double
    let volume: Double?
}

// MARK: - AI Models
struct AIAnalyzeRequest: Codable {
    let prompt: String
    let type: String?
    let symbol: String?
    let language: String?
}

struct AIAnalyzeResponse: Codable {
    let analysis: String
    let model: String?
    let provider: String?
}

// MARK: - Portfolio Models
struct ExchangeCredential: Codable, Identifiable {
    let id: String
    let exchange: String
    let label: String
    let testnet: Bool
    let createdAt: String
}

// MARK: - Notification Model
struct UserNotification: Codable, Identifiable {
    let id: String
    let type: String
    let title: String
    let body: String?
    let isRead: Bool
    let createdAt: String
}

// MARK: - API Response Wrapper
struct ApiResponseWrapper: Codable {
    let success: Bool?
    let data: AnyCodable?
}

/// Type-erased Codable value for dynamic JSON unwrapping
struct AnyCodable: Codable {
    let value: Any
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else if let string = try? container.decode(String.self) { value = string }
        else if let array = try? container.decode([AnyCodable].self) { value = array.map { $0.value } }
        else if let dict = try? container.decode([String: AnyCodable].self) { value = dict.mapValues { $0.value } }
        else { value = NSNull() }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let int as Int: try container.encode(int)
        case let double as Double: try container.encode(double)
        case let bool as Bool: try container.encode(bool)
        case let string as String: try container.encode(string)
        case let array as [Any]: try container.encode(array.map { AnyCodable(value: $0) })
        case let dict as [String: Any]: try container.encode(dict.mapValues { AnyCodable(value: $0) })
        default: try container.encodeNil()
        }
    }
    init(value: Any) { self.value = value }
}

// MARK: - API Error
enum APIError: LocalizedError {
    case unauthorized
    case noConnection
    case timeout
    case serverError(Int, String)
    case networkError(String)
    case decodingError(String)
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً"
        case .noConnection: return "لا يوجد اتصال بالإنترنت"
        case .timeout: return "انتهت مهلة الطلب"
        case .serverError(let code, let msg): return "خطأ الخادم \(code): \(msg)"
        case .networkError(let msg): return msg
        case .decodingError(let msg): return "خطأ في تحليل البيانات: \(msg)"
        case .unknown(let error): return error.localizedDescription
        }
    }
}
