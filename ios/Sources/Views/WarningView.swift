import SwiftUI

struct WarningView: View {
    let warnings: [WeatherWarning]

    var body: some View {
        let sorted = warnings.sorted { $0.severity > $1.severity }
        FlowLayout(spacing: 8) {
            ForEach(sorted, id: \.title) { w in
                Text("\(w.type)预警")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(warnColor(w.level))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background {
                        Capsule()
                            .fill(warnColor(w.level).opacity(0.15))
                            .overlay(Capsule().stroke(warnColor(w.level).opacity(0.45), lineWidth: 0.5))
                    }
            }
        }
    }
}

// Simple horizontal flow layout
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0; var y: CGFloat = 0; var rowH: CGFloat = 0
        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > width && x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            rowH = max(rowH, s.height); x += s.width + spacing
        }
        return CGSize(width: width, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX; var y = bounds.minY; var rowH: CGFloat = 0
        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            sv.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            rowH = max(rowH, s.height); x += s.width + spacing
        }
    }
}
