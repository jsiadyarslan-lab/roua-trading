import SwiftUI

struct PortfolioView: View {
    @StateObject private var vm = PortfolioViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: RouaTheme.Spacing.lg) {
                // Error Banner
                if let error = vm.errorMessage {
                    ErrorBanner(message: error) { Task { await vm.retry() } }
                }

                Text("المحفظة").font(.system(size: 22, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading)

                if vm.isLoading && vm.credentials.isEmpty {
                    ForEach(0..<2, id: \.self) { _ in
                        GlassCard { ShimmerView() }
                    }
                } else if vm.credentials.isEmpty {
                    GlassCard {
                        VStack(spacing: RouaTheme.Spacing.sm) {
                            Image(systemName: "wallet.pass").font(.system(size: 28)).foregroundStyle(RouaTheme.Colors.textTertiary)
                            Text("لا توجد حسابات مربوطة").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, RouaTheme.Spacing.xl)
                    }
                } else {
                    GlassCard {
                        VStack(spacing: RouaTheme.Spacing.md) {
                            Text("حسابات التداول").font(.system(size: 16, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading)
                            ForEach(vm.credentials) { cred in
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(cred.label).font(.system(size: 14, weight: .medium)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                        Text(cred.exchange.uppercased()).font(.system(size: 10)).foregroundStyle(RouaTheme.Colors.textTertiary)
                                    }
                                    Spacer()
                                    if cred.testnet { Text("تجريبي").font(.system(size: 10, weight: .medium)).foregroundStyle(RouaTheme.Colors.warning).padding(.horizontal, 8).padding(.vertical, 3).background(RouaTheme.Colors.warningBackground).clipShape(Capsule()) }
                                }.padding(.vertical, 4)
                            }
                        }
                    }
                }
            }.padding(RouaTheme.Spacing.lg)
        }.background(RouaTheme.Colors.background).task { await vm.loadData() }
        .navigationTitle("المحفظة")
    }
}
