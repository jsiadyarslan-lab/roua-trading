import Foundation
import Combine

// MARK: - WebSocket Manager — Binance + Socket.IO
@MainActor
class WebSocketManager: ObservableObject {
    static let shared = WebSocketManager()

    // MARK: - Published State
    @Published var isConnected = false
    @Published var lastPrice: Double?
    @Published var lastCandle: CandleData?
    @Published var lastTickerChange: Double?

    // MARK: - Private State
    private var binanceTask: URLSessionWebSocketTask?
    private var reconnectTimer: Timer?
    private var currentSymbol: String = ""
    private var currentInterval: String = "1min"
    private var buffer: [CandleData] = []
    private var lastFlushTime: Date = .distantPast
    private let maxFPS: Double = 24.0 // Max UI updates per second
    private var session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Connect to Binance WebSocket
    // Binance intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
    func connect(symbol: String, interval: String = "1m") {
        // Disconnect existing
        disconnect()

        self.currentSymbol = symbol
        self.currentInterval = interval

        // Convert symbol format: BTC/USDT -> btcusdt
        let wsSymbol = symbol.replacingOccurrences(of: "/", with: "").lowercased()
        // Normalize interval: "1min" → "1m", "1H" → "1h", etc.
        let normalizedInterval = normalizeBinanceInterval(interval)
        let streamName = "\(wsSymbol)@kline_\(normalizedInterval)/\(wsSymbol)@ticker"

        guard let url = URL(string: "\(APIConfig.binanceWSURL)/stream?streams=\(streamName)") else {
            print("[WS] Invalid Binance URL for symbol: \(symbol)")
            return
        }

        print("[WS] Connecting to Binance: \(url)")

        binanceTask = session.webSocketTask(with: url)
        binanceTask?.resume()

        isConnected = true
        receiveMessage()
    }

    // MARK: - Disconnect
    func disconnect() {
        binanceTask?.cancel(with: .normalClosure, reason: nil)
        binanceTask = nil
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        isConnected = false
        buffer.removeAll()
        print("[WS] Disconnected")
    }

    // MARK: - Receive Messages
    private func receiveMessage() {
        binanceTask?.receive { [weak self] result in
            guard let self = self else { return }

            Task { @MainActor in
                switch result {
                case .success(let message):
                    self.handleMessage(message)
                    // Continue receiving
                    self.receiveMessage()

                case .failure(let error):
                    print("[WS] Receive error: \(error.localizedDescription)")
                    self.isConnected = false
                    self.scheduleReconnect()
                }
            }
        }
    }

    // MARK: - Handle Incoming Message
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            parseBinanceMessage(text)
        case .data(let data):
            if let text = String(data: data, encoding: .utf8) {
                parseBinanceMessage(text)
            }
        @unknown default:
            break
        }
    }

    // MARK: - Parse Binance Message
    private func parseBinanceMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        // Combined stream format: { stream: "...", data: {...} }
        guard let streamName = json["stream"] as? String,
              let payload = json["data"] as? [String: Any] else { return }

        if streamName.contains("@kline") {
            parseKlineData(payload)
        } else if streamName.contains("@ticker") {
            parseTickerData(payload)
        }
    }

    // MARK: - Parse Kline (Candle) Data
    private func parseKlineData(_ payload: [String: Any]) {
        guard let kline = payload["k"] as? [String: Any] else { return }

        let time = kline["t"] as? TimeInterval ?? 0
        let open = kline["o"] as? String ?? "0"
        let high = kline["h"] as? String ?? "0"
        let low = kline["l"] as? String ?? "0"
        let close = kline["c"] as? String ?? "0"
        let volume = kline["v"] as? String ?? "0"

        let candle = CandleData(
            time: time / 1000, // Binance uses milliseconds
            open: Double(open) ?? 0,
            high: Double(high) ?? 0,
            low: Double(low) ?? 0,
            close: Double(close) ?? 0,
            volume: Double(volume) ?? 0
        )

        // Buffer and throttle UI updates
        buffer.append(candle)
        flushBufferIfNeeded()
    }

    // MARK: - Parse Ticker Data
    private func parseTickerData(_ payload: [String: Any]) {
        let lastPrice = payload["c"] as? String ?? "0"
        let changePercent = payload["P"] as? String ?? "0"

        self.lastPrice = Double(lastPrice)
        self.lastTickerChange = Double(changePercent)
    }

    // MARK: - Buffer Flush (Throttle to maxFPS)
    private func flushBufferIfNeeded() {
        let now = Date()
        let elapsed = now.timeIntervalSince(lastFlushTime)
        let minInterval = 1.0 / maxFPS

        if elapsed >= minInterval, !buffer.isEmpty {
            lastCandle = buffer.last
            buffer.removeAll()
            lastFlushTime = now
        }
    }

    // MARK: - Normalize Binance Interval
    private func normalizeBinanceInterval(_ interval: String) -> String {
        let mapping: [String: String] = [
            "1min": "1m", "1m": "1m",
            "3min": "3m", "3m": "3m",
            "5min": "5m", "5m": "5m",
            "15min": "15m", "15m": "15m",
            "30min": "30m", "30m": "30m",
            "1H": "1h", "1h": "1h",
            "4H": "4h", "4h": "4h",
            "1D": "1d", "1d": "1d",
        ]
        return mapping[interval] ?? interval.lowercased()
    }

    // MARK: - Auto Reconnect
    private func scheduleReconnect() {
        guard currentSymbol.isNotEmpty else { return }

        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            Task { @MainActor in
                print("[WS] Attempting reconnect for \(self.currentSymbol)...")
                self.connect(symbol: self.currentSymbol, interval: self.currentInterval)
            }
        }
    }
}

// MARK: - String Helper
extension String {
    var isNotEmpty: Bool { !isEmpty }
}
