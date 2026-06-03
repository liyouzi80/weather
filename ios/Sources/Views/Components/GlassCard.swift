import SwiftUI

// 卡片材质：对齐 PWA —— 扁平半透明深色填充（不用毛玻璃高斯模糊）。
// 在近乎纯色的天空渐变上观感与 .ultraThinMaterial 几乎一致，且让背景天气动效
// 隐约透出，省去移动端 GPU 合成开销。
extension Color {
    static let cardFill = Color(red: 20/255, green: 23/255, blue: 35/255).opacity(0.52)
    static let cardBorder = Color.white.opacity(0.10)
}

// 圆角刻度（对齐 PWA --radius-sm/--radius/--radius-lg）。卡片统一 22pt 连续圆角。
enum CardRadius {
    static let sm: CGFloat = 12
    static let regular: CGFloat = 22
    static let lg: CGFloat = 28
}

struct GlassCard<Content: View>: View {
    var topAccent: Color? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                    .fill(Color.cardFill)
                    .overlay {
                        // 顶部内高光：贴合 PWA inset 0 0.5px 0 rgba(255,255,255,0.05)
                        RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                            .strokeBorder(
                                LinearGradient(colors: [Color.white.opacity(0.10), Color.white.opacity(0.04)],
                                               startPoint: .top, endPoint: .bottom),
                                lineWidth: 0.5)
                    }
                    .overlay {
                        if let accent = topAccent {
                            // 顶部边框 accent 色，向下渐隐——贴合圆角，替代硬横条
                            RoundedRectangle(cornerRadius: CardRadius.regular, style: .continuous)
                                .strokeBorder(
                                    LinearGradient(colors: [accent, accent.opacity(0)],
                                                   startPoint: .top, endPoint: .center),
                                    lineWidth: 1.5
                                )
                        }
                    }
                    .shadow(color: .black.opacity(0.25), radius: 20, y: 4)
            }
    }
}

// Compact inline use without padding override
struct GlassBackground: ViewModifier {
    var cornerRadius: CGFloat = CardRadius.regular
    var topAccent: Color? = nil
    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.cardFill)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .strokeBorder(
                                LinearGradient(colors: [Color.white.opacity(0.10), Color.white.opacity(0.04)],
                                               startPoint: .top, endPoint: .bottom),
                                lineWidth: 0.5)
                    }
                    .overlay {
                        if let accent = topAccent {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .strokeBorder(
                                    LinearGradient(colors: [accent, accent.opacity(0)],
                                                   startPoint: .top, endPoint: .center),
                                    lineWidth: 1.5
                                )
                        }
                    }
                    .shadow(color: .black.opacity(0.25), radius: 16, y: 4)
            }
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = CardRadius.regular, topAccent: Color? = nil) -> some View {
        modifier(GlassBackground(cornerRadius: cornerRadius, topAccent: topAccent))
    }
}

// MARK: - 入场动画（对齐 PWA riseIn / cardIn：上移 14pt + 淡入，弹簧曲线）
// PWA --spring: cubic-bezier(0.32,0.72,0,1) ≈ SwiftUI .spring(response:0.55, dampingFraction:0.825)
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
