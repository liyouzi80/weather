import SwiftUI

struct WarningView: View {
    let warnings: [WeatherWarning]

    var body: some View {
        let sorted = warnings.sorted { $0.severity > $1.severity }
        CenteredFlowLayout(spacing: 8) {
            ForEach(Array(sorted.enumerated()), id: \.element.title) { idx, w in
                WarnChip(warning: w, delay: Double(idx) * 0.06)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// 预警 chip：scale 0.8 → 过冲 → 1 的弹性弹入，逐个错峰，传达「警报弹出」感（对齐 PWA chipPop）
private struct WarnChip: View {
    let warning: WeatherWarning
    let delay: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Text("\(warning.type)预警")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(warnColor(warning.level))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background {
                Capsule()
                    .fill(warnColor(warning.level).opacity(0.15))
                    .overlay(Capsule().stroke(warnColor(warning.level).opacity(0.45), lineWidth: 0.5))
            }
            .scaleEffect(shown ? 1 : 0.8)
            .opacity(shown ? 1 : 0)
            .onAppear {
                guard !shown else { return }
                if reduceMotion { shown = true; return }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.55).delay(delay)) {
                    shown = true
                }
            }
    }
}

// Centered horizontal flow layout
struct CenteredFlowLayout: Layout {
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
        // Build rows as index arrays, then center-place each row
        var rows: [[Int]] = [[]]
        var x: CGFloat = 0
        for (i, sv) in subviews.enumerated() {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > bounds.width && !rows[rows.count - 1].isEmpty {
                rows.append([]); x = 0
            }
            rows[rows.count - 1].append(i)
            x += s.width + spacing
        }
        var y = bounds.minY
        for rowIndices in rows {
            let rowSizes = rowIndices.map { subviews[$0].sizeThatFits(.unspecified) }
            let rowW = rowSizes.reduce(0) { $0 + $1.width } + CGFloat(max(rowSizes.count - 1, 0)) * spacing
            let rowH = rowSizes.map(\.height).max() ?? 0
            var cx = bounds.minX + (bounds.width - rowW) / 2
            for (idx, s) in zip(rowIndices, rowSizes) {
                subviews[idx].place(at: CGPoint(x: cx, y: y), proposal: ProposedViewSize(s))
                cx += s.width + spacing
            }
            y += rowH + spacing
        }
    }
}

// Keep FlowLayout for ProviderCardView (left-aligned)
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
