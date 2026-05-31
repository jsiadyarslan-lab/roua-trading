import SwiftUI

struct TradingView: View {
    @StateObject private var vm = TradingViewModel()
    @ObservedObject private var wsManager = WebSocketManager.shared
    @State private var showOrderSheet = false
    @State private var showSymbolPicker = false
    @State private var selectedTimeframe = "1m"

    private let timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"]
    private let popularSymbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT"]

    var body: some View {
        VStack(spacing: 0) {
            // Header with live price
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Button { showSymbolPicker = true } label: {
                        HStack(spacing: 4) {
                            Text(vm.symbol).font(.system(size: 22, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary)
                            Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(RouaTheme.Colors.textTertiary)
                        }
                    }

                    // Live price from WebSocket if available, otherwise from REST
                    let displayPrice = wsManager.lastPrice ?? vm.currentQuote?.last ?? 0
                    let displayChange = wsManager.lastTickerChange ?? vm.currentQuote?.changePercent ?? 0

                    HStack(spacing: 4) {
                        Text(String(format: "%.2f", displayPrice)).font(.system(size: 16, weight: .bold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary)
                        if displayChange != 0 { ChangeBadge(value: displayChange) }
                        if wsManager.isConnected {
                            PulsingDot(color: RouaTheme.Colors.profit)
                        }
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    Button { vm.orderSide = "BUY"; showOrderSheet = true } label: {
                        Text("شراء").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).frame(width: 70, height: 36)
                            .background(RouaTheme.Colors.buyGradient).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    Button { vm.orderSide = "SELL"; showOrderSheet = true } label: {
                        Text("بيع").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).frame(width: 70, height: 36)
                            .background(RouaTheme.Colors.sellGradient).clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }.padding(.horizontal, RouaTheme.Spacing.lg).padding(.vertical, RouaTheme.Spacing.md)

            // Error Banner
            if let error = vm.errorMessage {
                ErrorBanner(message: error) { Task { await vm.retry() } }
                    .padding(.horizontal, RouaTheme.Spacing.lg)
            }

            // Chart placeholder (Phase 2 will replace with LightweightChartsIOS)
            ZStack {
                RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md).fill(RouaTheme.Colors.surface).frame(height: 200)
                VStack(spacing: RouaTheme.Spacing.sm) {
                    Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 40)).foregroundStyle(RouaTheme.Colors.textTertiary)
                    if wsManager.isConnected {
                        Text("بيانات حية — الشارت قادم في المرحلة 2").font(.system(size: 11)).foregroundStyle(RouaTheme.Colors.textSecondary)
                    } else {
                        Text("الشارت سيكون متاحاً في المرحلة القادمة").font(.system(size: 11)).foregroundStyle(RouaTheme.Colors.textSecondary)
                    }
                }
            }.padding(.horizontal, RouaTheme.Spacing.lg)

            // Timeframe selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: RouaTheme.Spacing.sm) {
                    ForEach(timeframes, id: \.self) { tf in
                        Button {
                            selectedTimeframe = tf
                            wsManager.connect(symbol: vm.symbol, interval: tf)
                        } label: {
                            Text(tf).font(.system(size: 11, weight: selectedTimeframe == tf ? .bold : .medium))
                                .foregroundStyle(selectedTimeframe == tf ? .white : RouaTheme.Colors.textSecondary)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(selectedTimeframe == tf ? RouaTheme.Colors.accent : RouaTheme.Colors.surfaceElevated)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                }.padding(.horizontal, RouaTheme.Spacing.lg).padding(.vertical, RouaTheme.Spacing.sm)
            }

            // Positions
            ScrollView {
                VStack(spacing: RouaTheme.Spacing.md) {
                    Text("الصفقات المفتوحة").font(.system(size: 16, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, RouaTheme.Spacing.lg)

                    if vm.positions.isEmpty && !vm.isLoading {
                        GlassCard {
                            Text("لا توجد صفقات مفتوحة").font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textSecondary).frame(maxWidth: .infinity)
                        }
                    }

                    ForEach(vm.positions) { pos in
                        GlassCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 4) {
                                        Circle().fill(pos.side == "BUY" ? RouaTheme.Colors.profit : RouaTheme.Colors.loss).frame(width: 6, height: 6)
                                        Text(pos.symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                    }
                                    Text(pos.side == "BUY" ? "شراء" : "بيع").font(.system(size: 10)).foregroundStyle(pos.side == "BUY" ? RouaTheme.Colors.profit : RouaTheme.Colors.loss)
                                }
                                Spacer()
                                if let pnl = pos.unrealizedPnl {
                                    Text(String(format: "%+.2f", pnl)).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(pnl >= 0 ? RouaTheme.Colors.profit : RouaTheme.Colors.loss)
                                }
                            }
                        }
                    }
                }.padding(RouaTheme.Spacing.lg)
            }
        }.background(RouaTheme.Colors.background)
        .task {
            await vm.loadTradingData()
            wsManager.connect(symbol: vm.symbol, interval: selectedTimeframe)
        }
        .onDisappear { wsManager.disconnect() }
        .sheet(isPresented: $showOrderSheet) { OrderSheet(vm: vm) }
        .sheet(isPresented: $showSymbolPicker) {
            SymbolPickerView(selectedSymbol: $vm.symbol, symbols: popularSymbols) { symbol in
                vm.symbol = symbol
                Task {
                    await vm.loadTradingData()
                    wsManager.connect(symbol: symbol, interval: selectedTimeframe)
                }
            }
        }
        .navigationTitle("التداول")
    }
}

// MARK: - Symbol Picker View
struct SymbolPickerView: View {
    @Binding var selectedSymbol: String
    let symbols: [String]
    let onSelect: (String) -> Void
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            List(symbols, id: \.self) { symbol in
                Button {
                    onSelect(symbol)
                    dismiss()
                } label: {
                    HStack {
                        Text(symbol).font(.system(size: 16, weight: selectedSymbol == symbol ? .bold : .regular)).foregroundStyle(selectedSymbol == symbol ? RouaTheme.Colors.accent : RouaTheme.Colors.textPrimary)
                        Spacer()
                        if selectedSymbol == symbol {
                            Image(systemName: "checkmark").foregroundStyle(RouaTheme.Colors.accent)
                        }
                    }
                }
            }.background(RouaTheme.Colors.background).scrollContentBackground(.hidden)
            .navigationTitle("اختر الأداة").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("إلغاء") { dismiss() }.foregroundStyle(RouaTheme.Colors.textSecondary) } }
        }
    }
}

// MARK: - Order Sheet
struct OrderSheet: View {
    @ObservedObject var vm: TradingViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: RouaTheme.Spacing.lg) {
                    // Buy/Sell Toggle
                    HStack(spacing: 0) {
                        Button { vm.orderSide = "BUY" } label: { Text("شراء").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 44).foregroundStyle(vm.orderSide == "BUY" ? .white : RouaTheme.Colors.textTertiary).background(vm.orderSide == "BUY" ? RouaTheme.Colors.profit : RouaTheme.Colors.surfaceElevated) }
                        Button { vm.orderSide = "SELL" } label: { Text("بيع").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 44).foregroundStyle(vm.orderSide == "SELL" ? .white : RouaTheme.Colors.textTertiary).background(vm.orderSide == "SELL" ? RouaTheme.Colors.loss : RouaTheme.Colors.surfaceElevated) }
                    }.clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))

                    // Quantity
                    VStack(alignment: .leading, spacing: 4) {
                        Text("الكمية").font(.system(size: 12, weight: .medium)).foregroundStyle(RouaTheme.Colors.textSecondary)
                        TextField("0.00", text: $vm.quantity).font(.system(size: 16, weight: .semibold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.textPrimary).keyboardType(.decimalPad).padding().background(RouaTheme.Colors.surfaceElevated).clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))
                    }

                    // Stop Loss (Required)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text("وقف الخسارة").font(.system(size: 12, weight: .medium)).foregroundStyle(RouaTheme.Colors.textSecondary); Text("(مطلوب)").font(.system(size: 10)).foregroundStyle(RouaTheme.Colors.loss) }
                        TextField("0.00", text: $vm.stopLoss).font(.system(size: 16, weight: .semibold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.loss).keyboardType(.decimalPad).padding().background(RouaTheme.Colors.surfaceElevated).clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))
                    }

                    // Take Profit
                    VStack(alignment: .leading, spacing: 4) {
                        Text("جني الأرباح").font(.system(size: 12, weight: .medium)).foregroundStyle(RouaTheme.Colors.textSecondary)
                        TextField("0.00", text: $vm.takeProfit).font(.system(size: 16, weight: .semibold, design: .monospaced)).foregroundStyle(RouaTheme.Colors.profit).keyboardType(.decimalPad).padding().background(RouaTheme.Colors.surfaceElevated).clipShape(RoundedRectangle(cornerRadius: RouaTheme.CornerRadius.md))
                    }

                    // Order feedback
                    if let err = vm.orderError {
                        Text(err).font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.loss).padding().frame(maxWidth: .infinity, alignment: .leading).background(RouaTheme.Colors.lossBackground).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    if let ok = vm.orderSuccess {
                        Text("تم تقديم الطلب! رقم: \(ok.data.orderId)").font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.profit).padding().frame(maxWidth: .infinity, alignment: .leading).background(RouaTheme.Colors.profitBackground).clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    TradingButton(title: "\(vm.orderSide == "BUY" ? "شراء" : "بيع") \(vm.symbol)", style: vm.orderSide == "BUY" ? .buy : .sell, isLoading: vm.isPlacingOrder) {
                        Task { await vm.placeOrder(credentialId: "paper-trading") }
                    }
                }.padding(RouaTheme.Spacing.lg)
            }.background(RouaTheme.Colors.background).navigationTitle("تقديم طلب").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("إلغاء") { dismiss() }.foregroundStyle(RouaTheme.Colors.textSecondary) } }
        }
    }
}
