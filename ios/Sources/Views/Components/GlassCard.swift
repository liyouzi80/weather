import SwiftUI

// 卡片材质：对齐 PWA —— 扁平半透明深色填充（不用毛玻璃高斯模糊）。
// 在近乎纯色的天空渐变上观感与 .ultraThinMaterial 几乎一致，且让背景天气动效
// 隐约透出，省去移动端 GPU 合成开销。
extension Color {
    static let cardFill = Color(red: 20/255, green: 23/255, blue: 35/255).opacity(0.52)
    static let cardBorder = Color.white.opacity(0.10)
}

struct GlassCard<Content: View>: View {
    var topAccent: Color? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.cardFill)
                    .overlay {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .strokeBorder(Color.cardBorder, lineWidth: 0.5)
                    }
                    .overlay {
                        if let accent = topAccent {
                            // 顶部边框 accent 色，向下渐隐——贴合圆角，替代硬横条
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .strokeBorder(
                                    LinearGradient(colors: [accent, accent.opacity(0)],
                                                   startPoint: .top, endPoint: .center),
                                    lineWidth: 1
                                )
                        }
                    }
                    .shadow(color: .black.opacity(0.22), radius: 10, y: 4)
            }
    }
}

// Compact inline use without padding override
struct GlassBackground: ViewModifier {
    var cornerRadius: Double = 20
    var topAccent: Color? = nil
    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.cardFill)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .strokeBorder(Color.cardBorder, lineWidth: 0.5)
                    }
                    .overlay {
                        if let accent = topAccent {
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .strokeBorder(
                                    LinearGradient(colors: [accent, accent.opacity(0)],
                                                   startPoint: .top, endPoint: .center),
                                    lineWidth: 1
                                )
                        }
                    }
                    .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
            }
    }
}

extension View {
    func glassCard(cornerRadius: Double = 20, topAccent: Color? = nil) -> some View {
        modifier(GlassBackground(cornerRadius: cornerRadius, topAccent: topAccent))
    }
}
