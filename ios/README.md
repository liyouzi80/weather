# 天气 · iOS

番禺/安福天气的原生 iOS 版本，SwiftUI + SpriteKit，支持 iPhone 15 Pro/17 Pro 和 iPad Pro。

## 首次运行

### 1. 安装 XcodeGen

```bash
brew install xcodegen
```

### 2. 生成 Xcode 项目

```bash
cd ios
xcodegen generate
open TianQi.xcodeproj
```

### 3. （可选）配置对比信源 API Key

**番禺核心源（中央气象台 / 番禺气象台 / 美国 AQI）全部原生直抓，无需任何 key、无需任何后端，开箱即用。**

若想额外加入和风 / 彩云 / OWM 作对比源，在 `Sources/Utils/Keys.swift` 里硬编码：

```swift
enum Keys {
    static let qweather = "和风 key"   // 不填则跳过
    static let caiyun   = "彩云 token" // 不填则跳过
    static let owm      = "OWM key"    // 不填则跳过
}
```

> 建议把 `Keys.swift` 加入 `.gitignore` 防止 key 泄漏。

### 4. 配置签名

Xcode → Target TianQi → Signing & Capabilities：
- 勾选 Automatically manage signing
- Team 选你的 Apple ID（免费账号即可）

### 5. 连接 iPhone，选设备，点 Run ▶

---

## 架构：纯原生，无后端

不同于网页版（受浏览器 CORS 限制，需 Cloudflare Functions 代抓），原生 App 的
`URLSession` 无 CORS 限制，**所有数据源都在设备上直接抓取**，不依赖任何后端：

| 数据源 | 抓取方式 | 是否需 key |
|---|---|---|
| 中央气象台 `nmc.cn` | 直连 REST | 否 |
| 番禺气象台 `tqyb.com.cn` | 直抓 JS 数据文件 + HTML 解析 | 否 |
| 美国 AQI `air-quality.com` / `iqair.cn` | 直抓网页正则解析 | 否 |
| 和风 / 彩云 / OWM | 直连官方 API | 是（可选） |

> `tqyb.com.cn` 为 HTTP，已在 `project.yml` 配置 ATS 例外放行。

## 项目结构

```
Sources/
├── TianQiApp.swift          # App 入口
├── Models/                  # 数据模型
├── Services/                # 网络层 + 各信源适配器
├── ViewModels/              # @Observable 状态管理
├── Views/                   # SwiftUI 视图
│   └── Components/          # 复用组件（GlassCard 等）
├── Effects/                 # SpriteKit 天气动效
└── Utils/                   # 工具函数（月相算法、警示色等）
```

## 已实现功能

- [x] 多信源天气并排（中央气象台 / 番禺气象台 / 和风 / 彩云 / OWM）
- [x] Hero 大温度 + 多数天气状况
- [x] 关键指标条（体感 / 湿度 / AQI / 紫外线；正常区间中性白不着色，仅异常时升警示色）
- [x] 温度排行
- [x] 美国 AQI 对比
- [x] 番禺气象台短时预报卡
- [x] 预警信号 chips
- [x] SpriteKit 天气动效（雨 / 雷 / 雪 / 雾 / 晴日 / 晴夜 / 多云 / 阴）
- [x] 月相 + 月球位置（Meeus 算法）
- [x] 下拉刷新（原生 `.refreshable`）
- [x] 横滑切城市 + 页码点
- [x] iPhone / iPad 自适应
- [x] 120fps ProMotion 支持
- [x] 分钟级降水平滑面积图（仿苹果天气「下一小时降水量」，Canvas 贝塞尔曲线；和风信源，需 key）
- [x] iPad 横屏双栏布局（信源卡两列 + 内容限宽居中）
- [x] 上滑吸顶动效（Hero 视差淡出 + 顶部吸顶条）

## 可选优化

- [ ] 天气动效改用 `.sks` 粒子文件：当前为纯代码生成粒子（`WeatherScene.swift`），
      已完整可用；如需在 Xcode 粒子编辑器里可视化微调，可创建 `Rain.sks` 等文件，
      代码会自动优先加载（`SKEmitterNode(fileNamed:)`），缺失时回落到代码粒子。
