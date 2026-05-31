import Foundation

// MARK: - AI ViewModel
@MainActor
class AIViewModel: ObservableObject {
    @Published var messages: [(content: String, isUser: Bool, model: String?)] = []
    @Published var inputText = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = APIClient.shared

    func sendMessage() async {
        let text = inputText
        guard !text.isEmpty else { return }
        inputText = ""
        messages.append((content: text, isUser: true, model: nil))
        isLoading = true
        errorMessage = nil

        do {
            let request = AIAnalyzeRequest(prompt: text, language: "ar")
            let response: AIAnalyzeResponse = try await api.request("/ai/analyze", method: "POST", body: request)
            messages.append((content: response.analysis, isUser: false, model: response.model))
            isLoading = false
        } catch {
            let errorMsg = "فشل الاتصال بالذكاء الاصطناعي: \(error.localizedDescription)"
            messages.append((content: errorMsg, isUser: false, model: nil))
            errorMessage = errorMsg
            isLoading = false
            print("[AI] Send error: \(error.localizedDescription)")
        }
    }
}
