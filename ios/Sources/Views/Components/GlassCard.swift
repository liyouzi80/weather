import SwiftUI

// 圆角刻度（对齐 PWA --radius-sm/--radius/--radius-lg）。卡片统一 22pt 连续圆角。
enum CardRadius {
    static let sm: CGFloat = 12
    static let regular: CGFloat = 22
    static let lg: CGFloat = 28
}

// iOS 26+ Liquid Glass 卡片容器。
// `.glassEffect()` 直接使用系统 Liquid Glass 材质（模糊 + 高光 + 折射），
// 无需手动 Color.cardFill + strokeBorder 仿制，自动适配天气动效背景。
struct GlassCard<Content: View>: View {
    var topAccent: Color? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .overlay {
                if let accent = topAccent {
                    RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [accent, accent.opacity(0)],
                                startPoint: .top, endPoint: .center),
                            lineWidth: 1.5)
                }
            }
            .glassEffect(in: RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous))
    }
}

// 内联用途（只加背景，不包裹 padding）。
struct GlassBackground: ViewModifier {
    var cornerRadius: CGFloat = CardRadius.regular
    var topAccent: Color? = nil

    func body(content: Content) -> some View {
        content
            .overlay {
                if let topAccent {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [topAccent, topAccent.opacity(0)],
                                startPoint: .top, endPoint: .center),
                            lineWidth: 1.5)
                }
            }
            .glassEffect(in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = CardRadius.regular, topAccent: Color? = nil) -> some View {
        modifier(GlassBackground(cornerRadius: cornerRadius, topAccent: topAccent))
    }
}

// MARK: - 入场动画（对齐 PWA riseIn / cardIn）
struct RiseIn: ViewModifier {
    var delay: Double = 0
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 14)
            .onAppear {
                guard !shown else { return }
                if reduceMotion { shown = true; return }
                withAnimation(.spring(response: 0.55, dampingFraction: 0.825).delay(delay)) {
                    shown = true
                }
            }
    }
}

extension View {
    func riseIn(_ delay: Double = 0) -> some View { modifier(RiseIn(delay: delay)) }
}

// 按压缩放反馈（对齐 PWA .card-link:active { transform: scale(0.985) }）
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
