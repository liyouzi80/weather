# 多信源实况 · 番禺 / 安福

一个移动端优先的 Web 应用（可安装为 PWA），把**多个天气信源**对同一城市的此刻实况并排展示，**高亮各信源之间的差异**，并给出**温度排行**。当前覆盖两个城市：广州市**番禺区**、江西省吉安市**安福县**，顶部分段控件一键切换。部署在 Cloudflare Pages。

## 功能

- **多信源并排**：同一时刻拉取各信源实况，逐卡展示温度、天气现象、体感、湿度、风向风速、观测时间。
- **差异高亮**：标注全场最高/最低温、相对中位数的温差，并在天气现象描述分歧时给出提示。
- **温度排行**：按各信源温度从高到低排列，附相对均值的偏差。
- **双城切换**：番禺区 / 安福县（iOS 风格分段控件）。
- **番禺本地预报**：广州市气象局源额外附带「番禺区气象台」短时预报文字。

## 已接入的信源

展示顺序固定如下：

| 信源 | 密钥 | 覆盖 | 说明 |
|------|------|------|------|
| **中央气象台**（nmc.cn） | 否 | 全部 | 国家气象中心官方数据，按城市名经 `/essearch/api/autocomplete` 匹配站点编码后取实况 |
| **广州市气象局·番禺**（tqyb.com.cn） | 否 | 仅番禺 | 抓取官方数据文件，含基本站实况 + 番禺区气象台短时预报 |
| **和风天气** | 是 | 全部 | 注册 [dev.qweather.com](https://dev.qweather.com) 免费开发版 |
| **彩云天气** | 是 | 全部 | 申请 [platform.caiyunapp.com](https://platform.caiyunapp.com) token |
| **OpenWeatherMap** | 是 | 全部 | [openweathermap.org](https://openweathermap.org/api) 免费注册（免费层） |
| **WeatherAPI.com** | 是 | 全部 | [weatherapi.com](https://www.weatherapi.com) 免费注册（免费层每月 100 万次） |
| **Open-Meteo** | 否 | 全部 | 免费、支持跨域，开箱即用 |

> 应用内**不提供密钥录入界面**。需要密钥的信源在构建时通过 `VITE_*` 环境变量注入；未配置密钥的信源会自动不参与对比。

## 快速开始

```bash
npm install
cp .env.example .env   # 可选：填入需要密钥的信源的 VITE_* 变量
npm run dev            # 打开终端提示的地址（手机同 WiFi 可用局域网地址访问）
```

构建：`npm run build`（产物在 `dist/`）。

## 部署到 Cloudflare Pages

- 命令行：`npm run deploy`（= 构建 + `wrangler pages deploy`）。
- Git 集成（推荐）：Pages 连本仓库，构建命令 `npm run build`，输出目录 `dist`，分支 `main`。
- 环境变量在 CF 项目设置里配置：需要密钥的信源用 `VITE_*`（构建期注入到前端）。

## 架构

- **信源抽象**：`src/providers/types.ts` 定义统一的 `WeatherProvider` 接口与 `CurrentWeather` 模型。
  - `appliesTo(loc)` 可选方法用于限定信源覆盖范围（如广州市气象局仅在番禺展示）。
- **新增信源**：在 `src/providers/` 新建适配器并在 `src/providers/index.ts` 的 `PROVIDERS` 里登记即可（数组顺序即展示顺序），UI 无需改动。
- **统计与排行**：`src/App.tsx` 的 `analyze()` 计算中位数/极值并标注差异，`TempRanking` 渲染温度排行。
- **密钥**：`src/providers/keys.ts` 仅读取构建时注入的 `VITE_*` 环境变量。
- **服务端逻辑**（CORS 代理 / 页面抓取）放在 `functions/`（Cloudflare Pages Functions）：
  - `functions/proxy/[[path]].ts`：通用反向代理（qweather/caiyun/nmc）。
  - `functions/api/gz/realtime.ts` + `functions/_lib/gz.ts`：广州市气象局·番禺 数据抓取。
  - OpenWeatherMap、WeatherAPI.com 支持 CORS，前端直连，无需代理或 Function。
  - 开发环境由 `vite.config.ts` 的代理与 dev 插件复用同一套逻辑，本地无需 wrangler。

## 广州市气象局·番禺 数据来源

页面 `http://www.tqyb.com.cn/gzpanyu/` 由 `require.js` 驱动，实况/预报来自若干 `try{ var X = {...};}catch(e){}` 形式的数据文件（UTF-8 编码），`functions/_lib/gz.ts` 据此抓取并归一化：

- `/data/latestWeather/gz_latestWeather.js`：`baseObtInfo`（广州国家基本站 59287）为主、`gzObtInfo` 备用，提供温度/湿度/风/时雨量（`-999.9` 为缺测）。
- `/data/shorttime/GDPY_shorttime.js`：番禺区气象台短时预报文字，作为天气现象的补充展示。
