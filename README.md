# 天气实况 · 番禺 / 安福

多信源天气对比 PWA + 原生 iOS App。覆盖广州市**番禺区**与江西省**安福县**，左右滑动切换城市。Web 端部署在 Cloudflare Pages。

## 功能

- **多信源并排**：逐卡展示各信源实况——温度、体感、湿度、风向风速、观测时间
- **首屏概览**：平均温度 + 天气 · 体感 + 最高/最低温，全屏天气动效背景
- **关键指标条**：湿度、降水概率、空气质量、紫外线，偏离正常区间时黄/橙/红分级着色
- **美国 AQI 对比**：多源 AQI 逐卡展示，精确到本地监测站
- **气象预警**：当前生效预警信号，按级别配色
- **分钟级降水**：未来一小时降水强度曲线（和风天气）
- **天气动效**：按天气类型 + 昼夜渲染粒子特效，雨/雷/雪走 WebGPU 加速，含真实天文月相与月位
- **自动刷新**：下拉刷新，或回前台超 5 分钟 / 每 10 分钟自动刷新
- **iOS 原生 App**：SwiftUI + SpriteKit，与 PWA 对齐，含 WidgetKit 小组件
- **Scriptable 桌面小组件**：仿苹果天气布局，温度 + 天气 + AQI

## 天气信源

| 信源 | 密钥 | 覆盖 |
|------|------|------|
| 中央气象台（nmc.cn） | 否 | 全部 |
| 广州市气象局·番禺（tqyb.com.cn） | 否 | 仅番禺 |
| 中国天气网（weather.com.cn） | 否 | 全部 |
| 腾讯天气（wis.qq.com） | 否 | 全部 |
| 和风天气 | 是 | 全部 |
| 彩云天气 | 是 | 全部 |
| OpenWeatherMap | 是 | 全部 |

## AQI 信源（均免密钥）

| 信源 | 站点（番禺 / 安福） |
|------|------|
| 在意空气（air-quality.com） | 番禺大学城 / 安福县文化广场 |
| IQAir（iqair.cn） | 番禺大学城 / 安福县环保局 |

## 快速开始

```bash
npm install
cp .env.example .env   # 可选：填入 VITE_* 密钥
npm run dev
```

构建：`npm run build`，产物在 `dist/`。

## 部署

Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`，分支 `main`。密钥在 CF 项目设置里配置为 `VITE_*` 环境变量。

## iOS App

见 [`ios/README.md`](ios/README.md)。`xcodegen generate` 生成工程后用 Xcode 运行。

## Scriptable 小组件

1. App Store 安装 [Scriptable](https://scriptable.app)
2. 复制 `https://<你的域名>/WeatherWidget.js` 内容，粘进 Scriptable 新建脚本
3. 桌面添加 Scriptable 中号组件，Parameter 填 `0`（番禺）或 `1`（安福）
