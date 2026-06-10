import UIKit

// 轻量触觉反馈封装（对齐 PWA navigator.vibrate 的使用场景：切城市、下拉刷新）。
enum Haptics {
    static func light() {
        let g = UIImpactFeedbackGenerator(style: .light)
        g.prepare()
        g.impactOccurred()
    }

    static func soft() {
        let g = UIImpactFeedbackGenerator(style: .soft)
        g.prepare()
        g.impactOccurred()
    }

    // 三连短振：用于评分升/降（对齐 PWA haptic([8,30,8])）
    static func impact() {
        let g = UIImpactFeedbackGenerator(style: .rigid)
        g.prepare()
        g.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            g.impactOccurred(intensity: 0.6)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
            g.impactOccurred()
        }
    }
}
