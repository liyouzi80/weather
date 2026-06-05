import SwiftUI

// MARK: - 指标条等级：每项恒返回 颜色 + 等级文字（常驻显示，信息密度优先）
// 正常/舒适区间用中性白（不着色），仅偏离正常时逐级升到黄/橙/红/紫等警示色。与 PWA src/App.tsx 逐项对齐。

struct AlertStyle {
    let color: Color
    let level: String
}

private let metricNormal = Color(hex: "#f5f5f7") // 中性白：正常区间不加颜色

func feelsLevel(_ t: Double) -> AlertStyle {
    if t <= 10 { return AlertStyle(color: Color(hex: "#64d2ff"), level: "偏冷") }
    if t <= 26 { return AlertStyle(color: metricNormal, level: "舒适") }
    if t < 32  { return AlertStyle(color: Color(hex: "#ffd60a"), level: "偏热") }
    if t < 38  { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "较热") }
    return AlertStyle(color: Color(hex: "#ff453a"), level: "酷热")
}

func humidLevel(_ h: Double) -> AlertStyle {
    if h < 30  { return AlertStyle(color: Color(hex: "#ffd60a"), level: "偏干") }
    if h <= 70 { return AlertStyle(color: metricNormal, level: "舒适") }
    if h <= 85 { return AlertStyle(color: Color(hex: "#ffd60a"), level: "偏湿") }
    if h <= 92 { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "潮湿") }
    return AlertStyle(color: Color(hex: "#ff453a"), level: "闷湿")
}

func windLevel(_ v: Double) -> AlertStyle {
    if v < 20 { return AlertStyle(color: metricNormal, level: "微风") }
    if v < 40 { return AlertStyle(color: Color(hex: "#ffd60a"), level: "中风") }
    if v < 60 { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "强风") }
    return AlertStyle(color: Color(hex: "#ff453a"), level: "大风")
}

func aqiLevel(_ aqi: Int) -> AlertStyle {
    if aqi <= 50  { return AlertStyle(color: metricNormal, level: "优") }
    if aqi <= 100 { return AlertStyle(color: Color(hex: "#ffd60a"), level: "良") }
    if aqi <= 150 { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "轻度污染") }
    if aqi <= 200 { return AlertStyle(color: Color(hex: "#ff453a"), level: "中度污染") }
    if aqi <= 300 { return AlertStyle(color: Color(hex: "#af52de"), level: "重度污染") }
    return AlertStyle(color: Color(hex: "#a1304e"), level: "严重污染")
}

func popLevel(_ p: Double) -> AlertStyle {
    if p <= 20 { return AlertStyle(color: metricNormal, level: "晴好") }
    if p <= 40 { return AlertStyle(color: Color(hex: "#ffd60a"), level: "小概率") }
    if p <= 70 { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "中等") }
    return AlertStyle(color: Color(hex: "#ff453a"), level: "较大")
}

func uvLevel(_ uv: Double) -> AlertStyle {
    if uv <= 2 { return AlertStyle(color: metricNormal, level: "弱") }
    if uv <= 4 { return AlertStyle(color: Color(hex: "#ffd60a"), level: "中等") }
    if uv <= 6 { return AlertStyle(color: Color(hex: "#ff9f0a"), level: "较强") }
    if uv <= 9 { return AlertStyle(color: Color(hex: "#ff453a"), level: "强") }
    return AlertStyle(color: Color(hex: "#bf5af2"), level: "极强")
}

// AQI full scale (for detail cards)
func aqiColor(_ aqi: Int) -> Color {
    if aqi <= 50  { return Color(hex: "#34c759") }
    if aqi <= 100 { return Color(hex: "#ffd60a") }
    if aqi <= 150 { return Color(hex: "#ff9f0a") }
    if aqi <= 200 { return Color(hex: "#ff453a") }
    if aqi <= 300 { return Color(hex: "#af52de") }
    return Color(hex: "#a1304e")
}

func aqiCategory(_ aqi: Int) -> String {
    if aqi <= 50  { return "优" }
    if aqi <= 100 { return "良" }
    if aqi <= 150 { return "轻度污染" }
    if aqi <= 200 { return "中度污染" }
    if aqi <= 300 { return "重度污染" }
    return "严重污染"
}

func warnColor(_ level: String) -> Color {
    if level.contains("红") { return Color(hex: "#ff453a") }
    if level.contains("橙") { return Color(hex: "#ff9f0a") }
    if level.contains("黄") { return Color(hex: "#ffd60a") }
    return Color(hex: "#0a84ff")
}

// MARK: - Color from hex string
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int & 0xFF)         / 255
        self.init(red: r, green: g, blue: b)
    }
}
