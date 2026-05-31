import SwiftUI

struct AIChatView: View {
    @StateObject private var vm = AIViewModel()

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: RouaTheme.Spacing.md) {
                        // Welcome message if empty
                        if vm.messages.isEmpty {
                            VStack(spacing: RouaTheme.Spacing.lg) {
                                Image(systemName: "brain").font(.system(size: 48)).foregroundStyle(RouaTheme.Colors.accent.opacity(0.5))
                                Text("مساعد الذكاء الاصطناعي").font(.system(size: 18, weight: .semibold)).foregroundStyle(RouaTheme.Colors.textPrimary)
                                Text("اسألني عن أي شيء في التداول").font(.system(size: 13)).foregroundStyle(RouaTheme.Colors.textSecondary)
                            }.padding(.top, 60)
                        }

                        ForEach(vm.messages.indices, id: \.self) { i in
                            let msg = vm.messages[i]
                            HStack {
                                if msg.isUser { Spacer(minLength: 60) }
                                VStack(alignment: msg.isUser ? .trailing : .leading, spacing: 4) {
                                    Text(msg.content).font(.system(size: 14)).foregroundStyle(msg.isUser ? .white : RouaTheme.Colors.textPrimary)
                                        .padding(RouaTheme.Spacing.md).background(msg.isUser ? RouaTheme.Colors.accent : RouaTheme.Colors.surfaceElevated)
                                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    if let model = msg.model, !msg.isUser {
                                        Text(model).font(.system(size: 9)).foregroundStyle(RouaTheme.Colors.textTertiary)
                                    }
                                }
                                if !msg.isUser { Spacer(minLength: 60) }
                            }.id(i)
                        }
                        if vm.isLoading {
                            HStack {
                                Text("الذكاء الاصطناعي يفكر...").font(.system(size: 12)).foregroundStyle(RouaTheme.Colors.textTertiary).padding(.leading, 16)
                                Spacer()
                            }
                        }
                    }.padding(RouaTheme.Spacing.lg)
                }.onChange(of: vm.messages.count) { _, _ in withAnimation { proxy.scrollTo(vm.messages.count - 1, anchor: .bottom) } }
            }

            HStack(spacing: RouaTheme.Spacing.md) {
                TextField("اسأل الذكاء الاصطناعي...", text: $vm.inputText).font(.system(size: 14)).foregroundStyle(RouaTheme.Colors.textPrimary).tint(RouaTheme.Colors.accent).submitLabel(.send).onSubmit { Task { await vm.sendMessage() } }
                Button { Task { await vm.sendMessage() } } label: { Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)).foregroundStyle(RouaTheme.Colors.accent) }
                .disabled(vm.inputText.isEmpty || vm.isLoading)
            }.padding(RouaTheme.Spacing.md).background(RouaTheme.Colors.surface).clipShape(RoundedRectangle(cornerRadius: 16)).padding(.horizontal, RouaTheme.Spacing.lg).padding(.vertical, RouaTheme.Spacing.sm)
        }.background(RouaTheme.Colors.background).navigationTitle("مساعد AI")
    }
}
