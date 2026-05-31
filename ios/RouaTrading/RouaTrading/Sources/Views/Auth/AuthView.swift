import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @ObservedObject private var authService = AuthService.shared
    @State private var email = ""
    @State private var showRegistration = false

    var body: some View {
        ZStack {
            RouaTheme.Colors.background.ignoresSafeArea()
            Circle().fill(RouaTheme.Colors.accent.opacity(0.05)).frame(width: 400, height: 400).blur(radius: 80).offset(x: -100, y: -200)

            VStack(spacing: RouaTheme.Spacing.xxl) {
                Spacer()

                // Logo
                VStack(spacing: RouaTheme.Spacing.lg) {
                    ZStack {
                        RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.xl).fill(RouaTheme.Colors.accentGradient).frame(width: 80, height: 80)
                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 36, weight: .bold)).foregroundStyle(.white)
                    }
                    Text("ROUA TRADING").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(RouaTheme.Colors.textPrimary).tracking(4)
                    Text("منصة تداول مدعومة بالذكاء الاصطناعي").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary)
                }

                Spacer()

                // Google Sign In
                VStack(spacing: RouaTheme.Spacing.lg) {
                    TradingButton(title: "تسجيل الدخول بحساب Google", style: .primary, isLoading: authService.isLoading) {
                        Task { await authService.signInWithGoogle() }
                    }

                    // Divider
                    HStack {
                        Rectangle().fill(RouaTheme.Colors.borderLight).frame(height: 1)
                        Text("أو").font(.system(size: 11)).foregroundStyle(RouaTheme.Colors.textTertiary)
                        Rectangle().fill(RouaTheme.Colors.borderLight).frame(height: 1)
                    }

                    // Email field
                    HStack(spacing: RouaTheme.Spacing.md) {
                        Image(systemName: "envelope").foregroundStyle(RouaTheme.Colors.textTertiary).frame(width: 20)
                        TextField("البريد الإلكتروني", text: $email).font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textPrimary)
                            .tint(RouaTheme.Colors.accent).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    }.padding(RouaTheme.Spacing.lg).background(RouaTheme.Colors.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))

                    TradingButton(title: showRegistration ? "إنشاء حساب" : "تسجيل الدخول", style: .secondary, isLoading: false) {
                        Task { await authService.loginWithEmail(email: email) }
                    }

                    Button(showRegistration ? "لديك حساب بالفعل؟" : "إنشاء حساب جديد") {
                        withAnimation { showRegistration.toggle() }
                    }.font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.accentLight)
                }

                // Error Display
                if let error = authService.errorMessage {
                    ErrorBanner(message: error, onRetry: nil)
                }

                Spacer()
                Text("محمي بـ WebAuthn والمصادقة البيومترية").font(.system(size: 10)).foregroundStyle(RouaTheme.Colors.textTertiary)
            }.padding(.horizontal, RouaTheme.Spacing.xl)
        }
    }
}
