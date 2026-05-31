import SwiftUI

// MARK: - Design System
enum RouaTheme {
    enum Colors {
        static let background = Color(hex: "0A0E17")
        static let surface = Color(hex: "111827")
        static let surfaceElevated = Color(hex: "1A2332")
        static let surfaceOverlay = Color(hex: "1E293B")
        static let accent = Color(hex: "3B82F6")
        static let accentLight = Color(hex: "60A5FA")
        static let accentDark = Color(hex: "2563EB")
        static let profit = Color(hex: "00C853")
        static let profitLight = Color(hex: "69F0AE")
        static let profitBackground = Color(hex: "00C853").opacity(0.1)
        static let loss = Color(hex: "FF1744")
        static let lossLight = Color(hex: "FF5252")
        static let lossBackground = Color(hex: "FF1744").opacity(0.1)
        static let warning = Color(hex: "FFB300")
        static let warningBackground = Color(hex: "FFB300").opacity(0.1)
        static let info = Color(hex: "29B6F6")
        static let textPrimary = Color(hex: "F1F5F9")
        static let textSecondary = Color(hex: "94A3B8")
        static let textTertiary = Color(hex: "64748B")
        static let border = Color(hex: "1E293B")
        static let borderLight = Color(hex: "334155")
        static let buyGradient = LinearGradient(colors: [Color(hex: "00C853"), Color(hex: "00E676")], startPoint: .topLeading, endPoint: .bottomTrailing)
        static let sellGradient = LinearGradient(colors: [Color(hex: "FF1744"), Color(hex: "FF5252")], startPoint: .topLeading, endPoint: .bottomTrailing)
        static let accentGradient = LinearGradient(colors: [Color(hex: "3B82F6"), Color(hex: "8B5CF6")], startPoint: .topLeading, endPoint: .bottomTrailing)
        static let glassBackground = Color.white.opacity(0.05)
        static let glassBorder = Color.white.opacity(0.1)
    }
    enum Spacing {
        static let xs: CGFloat = 4; static let sm: CGFloat = 8; static let md: CGFloat = 12
        static let lg: CGFloat = 16; static let xl: CGFloat = 24; static let xxl: CGFloat = 32
    }
    enum CornerRadius {
        static let sm: CGFloat = 6; static let md: CGFloat = 10; static let lg: CGFloat = 16; static let xl: CGFloat = 24
    }
}

// MARK: - Color Hex Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}
