import SwiftUI

// MARK: - Tab Bar View
struct TabBarView: View {
    @State private var selectedTab = 0

    private let tabs = [
        ("لوحة المعلومات", "square.grid.2x2"),
        ("التداول", "chart.line.uptrend.xyaxis"),
        ("AI", "brain"),
        ("الماسح", "magnifyingglass"),
        ("المحفظة", "wallet.pass"),
        ("الإعدادات", "gearshape"),
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selectedTab {
                case 0: NavigationStack { DashboardView() }
                case 1: NavigationStack { TradingView() }
                case 2: NavigationStack { AIChatView() }
                case 3: NavigationStack { ScannerView() }
                case 4: NavigationStack { PortfolioView() }
                case 5: NavigationStack { SettingsView() }
                default: EmptyView()
                }
            }.padding(.bottom, 80)

            VStack(spacing: 0) {
                Divider().background(RouaTheme.Colors.border)
                HStack(spacing: 0) {
                    ForEach(0..<6, id: \.self) { i in
                        tabItem(i)
                    }
                }.padding(.horizontal, RouaTheme.Spacing.xs).padding(.top, RouaTheme.Spacing.sm).padding(.bottom, RouaTheme.Spacing.lg)
                .background(RouaTheme.Colors.surface.opacity(0.95)).background(.ultraThinMaterial)
            }
        }.background(RouaTheme.Colors.background)
    }

    private func tabItem(_ index: Int) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.2)) { selectedTab = index } } label: {
            VStack(spacing: 3) {
                Image(systemName: tabs[index].1).font(.system(size: 18)).foregroundStyle(selectedTab == index ? RouaTheme.Colors.accent : RouaTheme.Colors.textTertiary)
                Text(tabs[index].0).font(.system(size: 9, weight: .medium)).foregroundStyle(selectedTab == index ? RouaTheme.Colors.accent : RouaTheme.Colors.textTertiary)
            }.frame(maxWidth: .infinity)
        }
    }
}
