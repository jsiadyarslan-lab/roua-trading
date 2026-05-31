import Foundation

// MARK: - Trading ViewModel
@MainActor
class TradingViewModel: ObservableObject {
    @Published var symbol = "BTC/USDT"
    @Published var currentQuote: Quote?
    @Published var positions: [Position] = []
    @Published var orderSide = "BUY"
    @Published var orderType = "MARKET"
    @Published var quantity = ""
    @Published var stopLoss = ""
    @Published var takeProfit = ""
    @Published var isPlacingOrder = false
    @Published var orderSuccess: V2PlaceOrderResponse?
    @Published var orderError: String?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showError = false

    private let api = APIClient.shared

    func loadTradingData() async {
        isLoading = true
        errorMessage = nil

        do {
            async let quoteRequest: Quote = api.request("/exchange/quote/\(symbol)")
            async let positionsRequest: [Position] = api.request("/trading/v2/positions")

            let (quote, positions) = try await (quoteRequest, positionsRequest)

            self.currentQuote = quote
            self.positions = positions
            self.isLoading = false
        } catch {
            self.isLoading = false
            self.errorMessage = "فشل تحميل بيانات التداول: \(error.localizedDescription)"
            self.showError = true
            print("[Trading] Load error: \(error.localizedDescription)")
        }
    }

    func placeOrder(credentialId: String) async {
        guard let qty = Double(quantity), qty > 0 else {
            orderError = "الكمية غير صالحة"
            return
        }
        guard let sl = Double(stopLoss), sl > 0 else {
            orderError = "وقف الخسارة مطلوب ويجب أن يكون أكبر من صفر"
            return
        }

        isPlacingOrder = true
        orderError = nil

        let request = PlaceOrderRequest(
            exchangeCredentialId: credentialId,
            symbol: symbol,
            side: orderSide,
            type: orderType,
            quantity: qty,
            price: nil,
            stopLoss: sl,
            takeProfit: Double(takeProfit),
            idempotencyKey: UUID().uuidString,
            clientOrderId: nil
        )

        do {
            let response: V2PlaceOrderResponse = try await api.request("/trading/v2/orders", method: "POST", body: request)
            self.orderSuccess = response
            self.isPlacingOrder = false
            self.quantity = ""
            self.stopLoss = ""
            self.takeProfit = ""
            // Refresh positions after order
            await loadTradingData()
        } catch {
            self.orderError = "فشل تقديم الطلب: \(error.localizedDescription)"
            self.isPlacingOrder = false
            print("[Trading] Order error: \(error.localizedDescription)")
        }
    }

    func retry() async {
        await loadTradingData()
    }
}
