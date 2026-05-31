import Foundation

// MARK: - Dashboard ViewModel
@MainActor
class DashboardViewModel: ObservableObject {
    @Published var portfolioSummary: PortfolioSummary?
    @Published var positions: [Position] = []
    @Published var trades: [Trade] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showError = false

    private let api = APIClient.shared

    func loadDashboard() async {
        isLoading = true
        errorMessage = nil

        do {
            async let portfolioRequest: PortfolioSummary = api.request("/trading/v2/portfolio")
            async let positionsRequest: [Position] = api.request("/trading/v2/positions")
            async let tradesRequest: [Trade] = api.request("/trading/history")

            let (portfolio, positions, trades) = try await (portfolioRequest, positionsRequest, tradesRequest)

            self.portfolioSummary = portfolio
            self.positions = positions
            self.trades = Array(trades.prefix(10))
            self.isLoading = false
        } catch {
            self.isLoading = false
            self.errorMessage = "فشل تحميل لوحة المعلومات: \(error.localizedDescription)"
            self.showError = true
            print("[Dashboard] Load error: \(error.localizedDescription)")
        }
    }

    func retry() async {
        await loadDashboard()
    }
}
