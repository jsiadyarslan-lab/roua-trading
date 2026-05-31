import SwiftUI

struct DashboardView: View {
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: RouaTheme.Spacing.lg) {
                // Error Banner
                if let error = vm.errorMessage {
                    ErrorBanner(message: error) { Task { await vm.retry() } }
                }

                // Portfolio Summary
                GlassCard {
                    VStack(spacing: RouaTheme.Spacing.md) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("قيمة المحفظة").font(.system(size: 10, weight: .medium)).foregroundStyle(RouaTheme.Colors.textTertiary).textCase(.uppercase)
                                if vm.isLoading && vm.portfolioSummary == nil {
                                    ShimmerView()
                                } else if let p = vm.portfolioSummary {
                                    Text(String(format: "$%.2f", p.totalValue)).font(.system(size: 20, weight: .bold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                } else {
                                    Text("---").font(.system(size: 20, weight: .bold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textTertiary)
                                }
                            }
                            Spacer()
                            PulsingDot()
                        }
                        HStack(spacing: RouaTheme.Spacing.lg) {
                            StatMini(title: "ربح اليوم", value: vm.portfolioSummary.map { String(format: "$%.2f", $0.dailyPnl) } ?? "---", isPositive: (vm.portfolioSummary?.dailyPnl ?? 0) >= 0)
                            StatMini(title: "الصفقات", value: "\(vm.positions.count)")
                            StatMini(title: "إجمالي الربح", value: vm.portfolioSummary.map { String(format: "$%.2f", $0.totalPnl) } ?? "---", isPositive: (vm.portfolioSummary?.totalPnl ?? 0) >= 0)
                        }
                    }
                }

                // Active Positions
                Text("الصفقات النشطة").font(.system(size: 16, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading)

                if vm.isLoading && vm.positions.isEmpty {
                    ForEach(0..<3, id: \.self) { _ in
                        GlassCard { ShimmerView() }
                    }
                } else if vm.positions.isEmpty {
                    GlassCard {
                        VStack(spacing: RouaTheme.Spacing.sm) {
                            Image(systemName: "chart.bar").font(.system(size: 28)).foregroundStyle(RouaTheme.Colors.textTertiary)
                            Text("لا توجد صفقات مفتوحة").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, RouaTheme.Spacing.xl)
                    }
                } else {
                    ForEach(vm.positions) { pos in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Circle().fill(pos.side == "BUY" ? RouaTheme.Colors.profit : RouaTheme.Colors.loss).frame(width: 8, height: 8)
                                        Text(pos.symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                        Text(pos.side == "BUY" ? "شراء" : "بيع").font(.system(size: 10, weight: .medium)).foregroundStyle(pos.side == "BUY" ? RouaTheme.Colors.profit : RouaTheme.Colors.loss)
                                    }
                                    Text("الكمية: \(String(format: "%.4f", pos.quantity))").font(.system(size: 11, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textTertiary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 4) {
                                    if let pnl = pos.unrealizedPnl { Text(String(format: "%+.2f", pnl)).font(.system(size: 16, weight: .semibold, design: .monospaced)).foregroundStyle(pnl >= 0 ? RouaTheme.Colors.profit : RouaTheme.Colors.loss) }
                                    Text("الدخول: \(String(format: "%.2f", pos.entryPrice))").font(.system(size: 11, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textTertiary)
                                }
                            }
                        }
                    }
                }
            }.padding(.horizontal, RouaTheme.Spacing.lg)
        }.background(RouaTheme.Colors.background).refreshable { await vm.loadDashboard() }
        .task { await vm.loadDashboard() }
        .navigationTitle("لوحة المعلومات")
    }
}
