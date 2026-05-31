import Foundation

// MARK: - API Configuration
enum APIConfig {
    static let baseURL = "https://roua-trading-production.up.railway.app/api"
    static let wsURL = "wss://roua-trading-production.up.railway.app"
    static let binanceWSURL = "wss://stream.binance.com:9443"
    static let sessionHeader = "x-roua-session"
    static let requestTimeout: TimeInterval = 30
    static let maxRetryCount = 3
    static let retryDelay: UInt64 = 1_000_000_000 // 1 second in nanoseconds
}
