import Foundation

// 可选信源 API key（和风 / 彩云 / OWM）。番禺核心源（中央气象台 / 番禺气象台 / AQI）
// 全部原生直抓，无需任何 key 或后端。填了 key 就多一个对比源，不填则自动跳过。
//
// 个人自用：直接在下面硬编码即可（建议把本文件加入 .gitignore 防止泄漏）。
enum Keys {
    static let qweather = ""
    static let caiyun   = ""
    static let owm      = ""
}
