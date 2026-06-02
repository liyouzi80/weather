import SwiftUI

struct GlassCard<Content: View>: View {
    var topAccent: Color? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    }
                    .overlay(alignment: .top) {
                        if let accent = topAccent {
                            Rectangle()
                                .fill(accent)
                                .frame(height: 1.5)
                                .clipShape(
                                    UnevenRoundedRectangle(
                                        topLeadingRadius: 20,
                                        topTrailingRadius: 20,
                                        style: .continuous
                                    )
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
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    }
                    .overlay(alignment: .top) {
                        if let accent = topAccent {
                            Rectangle()
                                .fill(accent)
                                .frame(height: 1.5)
                                .clipShape(
                                    UnevenRoundedRectangle(
                                        topLeadingRadius: cornerRadius,
                                        topTrailingRadius: cornerRadius,
                                        style: .continuous
                                    )
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
