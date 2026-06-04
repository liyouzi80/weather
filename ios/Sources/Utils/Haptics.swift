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
}
