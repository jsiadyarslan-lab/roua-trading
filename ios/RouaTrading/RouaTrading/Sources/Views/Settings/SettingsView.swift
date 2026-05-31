import SwiftUI

struct SettingsView: View {
    @ObservedObject private var authService = AuthService.shared
    @State private var biometricEnabled = true
    @State private var pushEnabled = true
    @State private var showLogout = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: RouaTheme.Spacing.lg) {
                Text("الإعدادات").font(.system(size: 22, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading)

                // Profile Card
                GlassCard {
                    HStack(spacing: RouaTheme.Spacing.lg) {
                        ZStack { Circle().fill(RouaTheme.Colors.accentGradient).frame(width: 56, height: 56); Image(systemName: "person.fill").font(.system(size: 24)).foregroundStyle(.white) }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(authService.currentUser?.displayName ?? "المتداول").font(.system(size: 16, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary)
                            Text(authService.currentUser?.email ?? "").font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.textSecondary)
                            if let tier = authService.currentUser?.tier {
                                Text(tier).font(.system(size: 10, weight: .medium)).foregroundStyle(RouaTheme.Colors.accent).padding(.horizontal, 6).padding(.vertical, 2).background(RouaTheme.Colors.accent.opacity(0.1)).clipShape(Capsule())
                            }
                        }
                    }
                }

                // Settings Toggles
                GlassCard {
                    VStack(spacing: RouaTheme.Spacing.md) {
                        Toggle(isOn: $biometricEnabled) { Text("الفتح البيومتري").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textPrimary) }.tint(RouaTheme.Colors.accent)
                        Toggle(isOn: $pushEnabled) { Text("الإشعارات").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textPrimary) }.tint(RouaTheme.Colors.accent)
                    }
                }

                // App Info
                GlassCard {
                    VStack(spacing: RouaTheme.Spacing.sm) {
                        HStack { Text("الإصدار").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary); Spacer(); Text("2.0.0").font(.system(size: 14, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary) }
                        HStack { Text("البناء").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary); Spacer(); Text("Phase 1").font(.system(size: 14, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary) }
                    }
                }

                TradingButton(title: "تسجيل الخروج", style: .danger, isLoading: false) { showLogout = true }
                .alert("تسجيل الخروج", isPresented: $showLogout) {
                    Button("تسجيل الخروج", role: .destructive) { Task { await authService.logout() } }
                    Button("إلغاء", role: .cancel) {}
                } message: {
                    Text("هل أنت متأكد من تسجيل الخروج؟")
                }
            }.padding(RouaTheme.Spacing.lg)
        }.background(RouaTheme.Colors.background)
        .navigationTitle("الإعدادات")
    }
}
