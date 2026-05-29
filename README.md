# 番禺 · 多信源天气实况对比

一个移动端优先的 Web 应用（可安装为 PWA），把**多个天气信源**对广州市**番禺区**的此刻实况并排展示，并**高亮各信源之间的差异**。部署在 Cloudflare Pages。

## 已接入的信源

| 信源 | 密钥 | 说明 |
|------|------|------|
| **Open-Meteo** | 否 | 免费、支持跨域，开箱即用，默认源 |
| **中央气象台**（nmc.cn） | 否 | 中国气象局国家气象中心官方数据，按城市名匹配站点 |
| **广州市气象局·番禺**（tqyb.com.cn） | 否 | 抓取官方页面数据接口（见「待办」） |
| **和风天气** | 是 | 注册 [dev.qweather.com](https://dev.qweather.com) 免费开发版 |
| **彩云天气** | 是 | 申请 [platform.caiyunapp.com](https://platform.caiyunapp.com) token |
| **Apple 天气**（WeatherKit） | 是 | 需 Apple 开发者账号，服务端 ES256 JWT 鉴权 |
| **The Weather Channel**（weather.com） | 是 | api.weather.com v3，需 apiKey |

## 快速开始

```bash
npm install
cp .env.example .env   # 可选：填入密钥；前端类密钥也可在应用「设置」里临时填
npm run dev            # 打开终端提示的地址（手机同 WiFi 可用局域网地址访问）
```

构建：`npm run build`（产物在 `dist/`）。

## 部署到 Cloudflare Pages

- 命令行：`npm run deploy`（= 构建 + `wrangler pages deploy`）。
- Git 集成（推荐）：Pages 连本仓库，构建命令 `npm run build`，输出目录 `dist`，分支 `main`。
- 环境变量在 CF 项目设置里配置：前端密钥用 `VITE_*`（构建期注入），**Apple 凭证不要加 `VITE_` 前缀**（仅服务端使用）。

## 架构

- **信源抽象**：`src/providers/types.ts` 定义统一的 `WeatherProvider` 接口与 `CurrentWeather` 模型。
- **新增信源**：在 `src/providers/` 新建适配器并在 `src/providers/index.ts` 的 `PROVIDERS` 里登记即可，UI 无需改动。
- **差异高亮**：`src/App.tsx` 的 `analyze()` 计算各信源温度的中位数/极值，标注最高/最低、相对中位数温差，并对天气现象描述的分歧给出提示。
- **服务端逻辑**（CORS 代理 / 私钥签名 / 页面抓取）放在 `functions/`（Cloudflare Pages Functions）：
  - `functions/proxy/[[path]].ts`：通用反向代理（qweather/caiyun/nmc/twc）。
  - `functions/api/apple/current.ts` + `functions/_lib/apple.ts`：WeatherKit JWT 签名与调用。
  - `functions/api/gz/realtime.ts` + `functions/_lib/gz.ts`：广州市气象局·番禺 数据抓取。
  - 开发环境由 `vite.config.ts` 的代理与 dev 插件复用同一套逻辑，本地无需 wrangler。

## 待办：广州市气象局·番禺 数据接口

页面 `http://www.tqyb.com.cn/gzpanyu/` 的实况数值（温度/湿度/风/雨量/气压）**不在静态 HTML 里**——
HTML 中是 `--` 占位符，数据由页面 JS（`require.js` 模块 `gzshi_obtAreaRep`，区域代码 `GDPY`）
通过 XHR 从 `/data/` 下的接口异步加载。因此需直接请求该数据接口：

1. 浏览器打开页面 → F12 → Network → 筛选 XHR/Fetch；
2. 找到能让「番禺代表站」温度出现的那个请求（多在 `http://www.tqyb.com.cn/data/` 下，返回 JSON）；
3. 把其 URL 填入 `functions/_lib/gz.ts` 的 `GZ_DATA_URL`，并按返回结构调整 `mapData()`。
