# 天气实况 · 番禺 / 安福

多信源天气对比 PWA + 原生 iOS App。覆盖广州市**番禺区**与江西省**安福县**，左右滑动切换城市。Web 端部署在 Cloudflare Pages，番禺气象台数据经国内函数计算（阿里云 / 华为云）兜底。

## 功能

- **多信源并排**：逐卡展示各信源实况——温度、体感、湿度、风向风速、观测时间
- **信源可信度评分**：左右滑动卡片评 0–5 分，评分加权影响聚合温度与天气文字；持久化到 localStorage；卡片按评分排序，评分为 0 的信源不计入聚合
- **流式加载**：各信源各自返回即各自渲染，快源先出，不被最慢的源（如番禺气象台抓取超时）拖住整批；失败源后台退避补齐
- **首屏概览**：加权平均温度 + 天气状况，全屏天气动效背景
- **关键指标条**：体感、湿度、紫外线、风速；体感与湿度始终按舒适度着色（绿→黄→橙→红），紫外线/风速偏离正常时按级着色
- **AQI 对比**：多源空气质量逐卡展示，精确到本地监测站
- **气象预警**：当前生效预警信号，按级别配色
- **分钟级降水**：未来一小时降水强度曲线（和风天气）
- **天气动效**：按天气类型 + 昼夜渲染的全屏背景——Perlin 分形噪声云（多云/阴天，与 iOS 端同款观感）、晴天高层卷云、真实天文月相与月位；雨/雷/雪走 WebGPU 加速
- **数据合理性护栏**：区域均值类信源（番禺气象台）对温度等做范围校验，拦截个别故障站点造成的异常值
- **自动刷新**：手动点击刷新，或回前台超 5 分钟 / 每 10 分钟自动刷新
- **现代浏览器渐进增强**：Glassmorphism 玻璃卡、Scroll-driven Animations 卡片入场、View Transitions 城市切换转场（Safari 18+ / Chrome 111+），不支持则安全回退
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

需密钥的信源仅在构建时配置了对应 `VITE_*` 环境变量才启用，未配置则自动不参与对比。

## AQI 信源（均免密钥）

| 信源 | 站点（番禺 / 安福） |
|------|------|
| 在意空气（air-quality.com） | 番禺大学城 / 安福县文化广场 |
| IQAir（iqair.cn） | 番禺大学城 / 安福县环保局 |

## 技术栈

- **前端**：React 18 + TypeScript + Vite，无 UI 框架，纯 CSS
- **动效**：Canvas 2D + WebGPU（雨/雷/雪粒子）、Perlin 分形噪声烘焙云纹理、SVG 滤镜生成高层卷云
- **服务端**：Cloudflare Pages Functions（TS）——统一反代解决 CORS、抓取并归一化番禺气象台与 AQI 站点页
- **兜底**：tqyb.com.cn 封锁海外 IP 时，经阿里云 / 华为云函数计算国内节点抓取

## 项目结构

```
src/                 PWA 前端
  providers/         各天气信源适配器 + 注册表
  WeatherFX.tsx      Canvas 天气动效（云/雨/雪/雾/晴）
  App.tsx            主界面与数据编排
functions/           Cloudflare Pages Functions（反代 / 抓取 / AQI）
aliyun-functions/    阿里云 FC 兜底（番禺气象台）
hw-functions/        华为云 FC 兜底
ios/                 SwiftUI + SpriteKit 原生 App（见 ios/README.md）
public/              PWA 图标、manifest、Scriptable 小组件脚本
```

## 快速开始

```bash
npm install
cp .env.example .env   # 可选：填入 VITE_* 密钥
npm run dev
```

构建：`npm run build`，产物在 `dist/`。

## 部署

Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`，分支 `main`。密钥在 CF 项目设置里配置为 `VITE_*` 环境变量（构建时注入，修改后需重新部署）。

## iOS App

见 [`ios/README.md`](ios/README.md)。`xcodegen generate` 生成工程后用 Xcode 运行。

## Scriptable 小组件

1. App Store 安装 [Scriptable](https://scriptable.app)
2. 复制 `https://<你的域名>/WeatherWidget.js` 内容，粘进 Scriptable 新建脚本
3. 桌面添加 Scriptable 中号组件，Parameter 填 `0`（番禺）或 `1`（安福）
