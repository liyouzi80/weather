# 天气实况 · 番禺 / 安福

一个移动端优先的 Web 应用（可安装为 PWA），把**多个天气信源**对同一城市的此刻实况并排展示，并给出**温度排行**。当前覆盖两个城市：广州市**番禺区**、江西省吉安市**安福县**，顶部一键切换。配套提供 **iOS Scriptable 桌面小组件**。部署在 Cloudflare Pages。

## 功能

- **多信源并排**：同一时刻拉取各信源实况，逐卡展示温度、天气现象（含 emoji 图标）、体感、湿度、风向风速、观测时间。
- **概览**：全场平均温度 + 多数天气图标 + 最高/最低温。
- **温度排行**：各信源按温度从高到低排列，条形可视化。
- **美国 AQI 对比**：概览卡显示多源平均 US AQI（按等级配色），下方逐源列出 AQI/主要污染物；三源**全部免密钥**——**在意空气**（air-quality.com）、**IQAir**（iqair.cn）均精确到本地站点（番禺大学城 / 安福县文化广场·环保局），**Open-Meteo** 为模型值。
- **双城切换**：番禺区 / 安福县，顶部图标按钮一键切换（城市切换 + 刷新同款样式）。
- **番禺本地预报**：广州市气象局源附带「番禺区气象台」短时预报，并带**时效检测**——超出预报窗口（北京时）自动隐藏，前端与服务端双重过滤。
- **动效**：概览/排行/卡片渐入、排行依次入场、触摸反馈；尊重系统「减弱动态效果」。
- **iOS 沉浸**：`viewport-fit=cover` + `apple-mobile-web-app-*`，「添加到主屏」后状态栏沉浸。
- **桌面小组件**：Scriptable 组件（中/小号），与首页概览一致——地名 + 天气图标 + 平均气温 + 最高/最低。
- **天气主题图标**：PWA 自带天气图标（深蓝渐变 + 发光太阳 + 白云），含 iOS `apple-touch-icon` 与 Android maskable。

## 已接入的信源

展示顺序固定如下：

| 信源 | 密钥 | 覆盖 | 说明 |
|------|------|------|------|
| **中央气象台**（nmc.cn） | 否 | 全部 | 国家气象中心官方数据，按城市名经 `/essearch/api/autocomplete` 匹配站点编码后取实况 |
| **广州市气象局·番禺**（tqyb.com.cn） | 否 | 仅番禺 | 抓取官方数据文件，含番禺站实况 + 番禺区气象台短时预报 |
| **中国天气网**（weather.com.cn） | 否 | 全部 | 气象局旗下，`d1.weather.com.cn/sk_2d/{城市码}.html`，区县级实况（需 Referer，走代理） |
| **腾讯天气**（wis.qq.com） | 否 | 全部 | 按省/市/区县名查 observe 实况，无需密钥 |
| **和风天气** | 是 | 全部 | 注册 [dev.qweather.com](https://dev.qweather.com) 免费开发版 |
| **彩云天气** | 是 | 全部 | 申请 [platform.caiyunapp.com](https://platform.caiyunapp.com) token |
| **OpenWeatherMap** | 是 | 全部 | [openweathermap.org](https://openweathermap.org/api) 免费注册（免费层） |
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

## iOS 桌面小组件（Scriptable）

1. App Store 安装 [Scriptable](https://scriptable.app)。
2. 用 Safari 打开 `https://<你的域名>/WeatherWidget.js`，全选复制，粘进 Scriptable 新建脚本（避免从富文本复制导致引号被转义）。
   - 如需自动更新，可改用加载器：`const code = await new Request("https://<你的域名>/WeatherWidget.js").loadString(); await eval("(async()=>{"+code+"})()")`。
3. 桌面添加 Scriptable 中号组件 → 编辑 → 选该脚本 → Parameter 填 `0`（番禺）或 `1`（安福）。
4. 数据来自聚合接口 `/api/widget?lat=&lon=&name=&cityName=`（服务端并发拉各信源，免 CORS）。

## 架构

- **信源抽象**：`src/providers/types.ts` 定义统一的 `WeatherProvider` 接口与 `CurrentWeather` 模型。
  - `appliesTo(loc)` 可选方法用于限定信源覆盖范围（如广州市气象局仅在番禺展示）。
- **新增信源**：在 `src/providers/` 新建适配器并在 `src/providers/index.ts` 的 `PROVIDERS` 里登记即可（数组顺序即展示顺序），UI 无需改动。
- **统计与排行**：`src/App.tsx` 的 `analyze()` 计算平均/极值与多数天气，`TempRanking` 渲染温度排行。
- **密钥**：`src/providers/keys.ts` 仅读取构建时注入的 `VITE_*` 环境变量。
- **服务端逻辑**（CORS 代理 / 页面抓取 / 聚合）放在 `functions/`（Cloudflare Pages Functions）：
  - `functions/proxy/[[path]].ts`：通用反向代理（nmc / weathercn（补 Referer）/ tencent / qweather / caiyun）。
  - `functions/api/gz/realtime.ts` + `functions/_lib/gz.ts`：广州市气象局·番禺 数据抓取（含短时预报时效检测）。
  - `functions/api/widget.ts`：小组件聚合接口，服务端并发拉各信源并归一化。
  - OpenWeatherMap、Open-Meteo 支持 CORS，前端直连，无需代理或 Function。
  - 开发环境由 `vite.config.ts` 的代理与 dev 插件复用同一套逻辑，本地无需 wrangler。

## 广州市气象局·番禺 数据来源

页面 `http://www.tqyb.com.cn/gzpanyu/` 由 `require.js` 驱动，实况/预报来自若干 `try{ var X = {...};}catch(e){}` 形式的数据文件（UTF-8 编码），`functions/_lib/gz.ts` 据此抓取并归一化：

- `/data/latestWeather/gz_latestWeather.js`：`gzObtInfo`（番禺本地站）为主、`baseObtInfo`（广州基本站 59287）备用，提供温度/湿度/风/时雨量（`-999.9` 为缺测）。
- `/data/shorttime/GDPY_shorttime.js`：番禺区气象台短时预报文字；过期（超出预报窗口）则不返回。
