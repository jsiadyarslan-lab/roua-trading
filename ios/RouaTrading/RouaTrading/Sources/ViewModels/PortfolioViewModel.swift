import Foundation

// MARK: - Portfolio ViewModel
@MainActor
class PortfolioViewModel: ObservableObject {
    @Published var credentials: [ExchangeCredential] = []
    @Published var totalValue: Double = 0
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showError = false

    private let api = APIClient.shared

    func loadData() async {
        isLoading = true
        errorMessage = nil

        do {
            let creds: [ExchangeCredential] = try await api.request("/portfolio/credentials")
            self.credentials = creds
            self.isLoading = false
        } catch {
            self.isLoading = false
            self.errorMessage = "فشل تحميل المحفظة: \(error.localizedDescription)"
            self.showError = true
            print("[Portfolio] Error: \(error.localizedDescription)")
        }
    }

    func retry() async {
        await loadData()
    }
}
