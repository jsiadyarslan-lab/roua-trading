import Foundation

// MARK: - Scanner ViewModel
@MainActor
class ScannerViewModel: ObservableObject {
    @Published var results: [ScanResult] = []
    @Published var heatmapData: [HeatmapItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showError = false

    private let api = APIClient.shared

    func runScan() async {
        isLoading = true
        errorMessage = nil

        do {
            async let scanRequest: [ScanResult] = api.request("/scanner/scan")
            async let heatmapRequest: [HeatmapItem] = api.request("/scanner/heatmap")

            let (results, heatmap) = try await (scanRequest, heatmapRequest)

            self.results = results
            self.heatmapData = heatmap
            self.isLoading = false
        } catch {
            self.isLoading = false
            self.errorMessage = "فشل مسح السوق: \(error.localizedDescription)"
            self.showError = true
            print("[Scanner] Error: \(error.localizedDescription)")
        }
    }

    func retry() async {
        await runScan()
    }
}
