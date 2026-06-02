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

### 3. 配置 API Keys 和 Base URL

在 Xcode 中：Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables，添加：

| 变量名 | 说明 |
|---|---|
| `QWEATHER_KEY` | 和风天气 API Key |
| `CAIYUN_KEY` | 彩云天气 token |
| `OWM_KEY` | OpenWeatherMap API Key |
| `BASE_URL` | Cloudflare Pages 部署地址，如 `https://xxx.pages.dev` |

（或直接在 `Sources/Utils/Keys.swift` 里硬编码，仅个人使用）

### 4. 配置签名

Xcode → Target TianQi → Signing & Capabilities：
- 勾选 Automatically manage signing
- Team 选你的 Apple ID（免费账号即可）

### 5. 连接 iPhone，选设备，点 Run ▶

---

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
- [x] 关键指标条（体感 / 湿度 / AQI / 紫外线，警示色）
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

## 待完善

- [ ] 分钟级降水柱状图
- [ ] iPad 横屏双栏布局
- [ ] 天气动效使用 `.sks` 粒子文件（需在 Xcode 中创建）
- [ ] 上滑吸顶动效（视差滚动）
