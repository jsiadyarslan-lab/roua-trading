import SwiftUI

struct ScannerView: View {
    @StateObject private var vm = ScannerViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: RouaTheme.Spacing.lg) {
                // Error Banner
                if let error = vm.errorMessage {
                    ErrorBanner(message: error) { Task { await vm.retry() } }
                }

                Text("ماسح السوق").font(.system(size: 22, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading)

                if vm.isLoading && vm.results.isEmpty {
                    ForEach(0..<5, id: \.self) { _ in
                        GlassCard { ShimmerView() }
                    }
                } else if vm.results.isEmpty {
                    GlassCard {
                        VStack(spacing: RouaTheme.Spacing.sm) {
                            Image(systemName: "magnifyingglass").font(.system(size: 28)).foregroundStyle(RouaTheme.Colors.textTertiary)
                            Text("لا توجد نتائج مسح").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, RouaTheme.Spacing.xl)
                    }
                } else {
                    ForEach(vm.results) { r in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(r.symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                    if let n = r.name { Text(n).font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.textTertiary).lineLimit(1) }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 4) {
                                    Text(String(format: "%.2f", r.price)).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                    ChangeBadge(value: r.changePercent)
                                }
                            }
                        }
                    }
                }
            }.padding(RouaTheme.Spacing.lg)
        }.background(RouaTheme.Colors.background).task { await vm.runScan() }.refreshable { await vm.runScan() }
        .navigationTitle("الماسح")
    }
}
