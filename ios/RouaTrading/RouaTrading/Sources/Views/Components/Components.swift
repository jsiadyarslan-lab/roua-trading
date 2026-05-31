import SwiftUI

// MARK: - Glass Card
struct GlassCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content.padding(RouaTheme.Spacing.lg)
            .background(RouaTheme.Colors.glassBackground).background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.lg))
            .overlay(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.lg).stroke(RouaTheme.Colors.glassBorder, lineWidth: 1))
    }
}

// MARK: - Trading Button
struct TradingButton: View {
    let title: String
    let style: TradingButtonStyle
    let isLoading: Bool
    let action: () -> Void

    enum TradingButtonStyle { case buy, sell, primary, secondary, danger }

    private var bgColor: Color {
        switch style {
        case .buy: return RouaTheme.Colors.profit
        case .sell, .danger: return RouaTheme.Colors.loss
        case .primary: return RouaTheme.Colors.accent
        case .secondary: return RouaTheme.Colors.surfaceElevated
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading { ProgressView().tint(.white).controlSize(.small) }
                Text(title).font(.system(size: 14, weight: .semibold))
            }.frame(maxWidth: .infinity).frame(height: 50).foregroundStyle(.white)
            .background(bgColor).clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))
        }.disabled(isLoading)
    }
}

// MARK: - Change Badge
struct ChangeBadge: View {
    let value: Double
    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: value >= 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill").font(.system(size: 8))
            Text(String(format: "%.2f%%", abs(value))).font(.system(size: 11, weight: .medium, design: .monospaced))
        }.foregroundStyle(value >= 0 ? RouaTheme.Colors.profit : RouaTheme.Colors.loss)
        .padding(.horizontal, 6).padding(.vertical, 3)
        .background(value >= 0 ? RouaTheme.Colors.profitBackground : RouaTheme.Colors.lossBackground)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

// MARK: - Pulsing Dot
struct PulsingDot: View {
    let color: Color
    @State private var isPulsing = false
    init(color: Color = RouaTheme.Colors.profit) { self.color = color }
    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8).scaleEffect(isPulsing ? 1.3 : 1.0).opacity(isPulsing ? 0.6 : 1.0)
            .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: isPulsing).onAppear { isPulsing = true }
    }
}

// MARK: - Shimmer View
struct ShimmerView: View {
    @State private var isAnimating = false
    var body: some View {
        Rectangle().fill(RouaTheme.Colors.surfaceElevated).frame(height: 20)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(Rectangle().fill(LinearGradient(colors: [.clear, .white.opacity(0.08), .clear], startPoint: .leading, endPoint: .trailing)).offset(x: isAnimating ? 300 : -300))
            .onAppear { withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) { isAnimating = true } }
    }
}

// MARK: - Stat Mini
struct StatMini: View {
    let title: String
    let value: String
    var isPositive: Bool? = nil
    var body: some View {
        VStack(spacing: 2) {
            Text(title).font(.system(size: 10, weight: .medium)).foregroundStyle(RouaTheme.Colors.textTertiary)
            Text(value).font(.system(size: 13, design: .monospaced)).foregroundStyle(
                isPositive == true ? RouaTheme.Colors.profit : isPositive == false ? RouaTheme.Colors.loss : RouaTheme.Colors.textPrimary
            )
        }.padding(.horizontal, 8).padding(.vertical, 4).background(RouaTheme.Colors.surfaceElevated).clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

// MARK: - Error Banner
struct ErrorBanner: View {
    let message: String
    let onRetry: (() -> Void)?

    var body: some View {
        VStack(spacing: RouaTheme.Spacing.sm) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(RouaTheme.Colors.warning)
                Text(message).font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.textSecondary).lineLimit(3)
                Spacer()
            }
            if let onRetry = onRetry {
                Button(action: onRetry) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise").font(.system(size: 11))
                        Text("إعادة المحاولة").font(.system(size: 12, weight: .medium))
                    }.foregroundStyle(RouaTheme.Colors.accent)
                }
            }
        }.padding(RouaTheme.Spacing.md)
        .background(RouaTheme.Colors.warningBackground)
        .clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))
    }
}
