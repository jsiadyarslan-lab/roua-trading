import SwiftUI

// MARK: - App Entry Point
@main
struct RouaTradingApp: App {
    @ObservedObject private var authService = AuthService.shared

    var body: some Scene {
        WindowGroup {
            if authService.isAuthenticated {
                TabBarView()
            } else {
                AuthView()
            }
            .tint(RouaTheme.Colors.accent)
            .preferredColorScheme(.dark)
            .onAppear { authService.checkExistingSession() }
        }
    }
}
