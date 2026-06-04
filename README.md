# 天气实况 · 番禺 / 安福

一个移动端优先的 Web 应用（可安装为 PWA），把**多个天气信源**对同一城市的此刻实况并排展示，并给出**温度排行**与**美国 AQI 对比**。当前覆盖两个城市：广州市**番禺区**、江西省吉安市**安福县**，左右滑动切换。除 PWA 外还提供**原生 iOS App**（SwiftUI + SpriteKit，与 PWA 功能与设计语言对齐）与 **iOS Scriptable 桌面小组件**。Web 端部署在 Cloudflare Pages。

## 功能

- **多信源并排**：同一时刻拉取各信源实况，逐卡展示温度、天气现象（含 emoji 图标）、体感、湿度、风向风速、观测时间。
- **概览**：全场平均温度（整数显示）+ 多数天气图标 + 最高/最低温。
- **关键指标条**：体感、湿度、空气质量、**紫外线指数**一排（图标 + 数值 + 标签竖排，去卡片框直接浮于天气动效之上，呼应苹果天气）。每项均常驻「数值 · 等级」文字——**正常/舒适区间用中性白不着色**，仅在偏离正常时才逐级升到黄/橙/红/紫等警示色（如体感偏热黄、酷热红，空气轻度污染橙、重度紫），一眼即可分辨异常项。
- **温度排行**：各信源按温度从高到低排列，条形可视化。
- **美国 AQI 对比**：以**空气质量评级**为主体（按等级配色）显示多源平均 US AQI；下方逐源列出 AQI、主要污染物与今/明 AQI 预报。两源**全部免密钥**：**在意空气**（air-quality.com）与 **IQAir**（iqair.cn），均精确到本地监测站（番禺大学城 / 安福县文化广场·安福县环保局）。
- **拟真天气动效**：随当前天气渲染对应粒子特效，覆盖全部天气类型并区分昼夜——雨/雷（多层景深雨幕 + 分叉闪电）、雪（景深雪花）、雾（分层带状漂移 + 体积雾团缓移）、晴日（god rays 光芒 + 光尘）、晴夜（月轮 + 亮星十字 + 随机流星）、多云（昼：浅云缓移；夜：蓝灰云 + 月轮穿云 + 稀星）、阴（厚云铺满、密不透光，夜间不见月星）。云朵用 **SVG 分形噪声位移**（`feTurbulence` + `feDisplacementMap`）生成绒边而非雾团光晕，分远/中/近三层景深、月轮夹于层间形成自然遮挡；并按北京时太阳位置做**日出/日落暖色染色**，黄昏柔和过渡不突变。慢动效限速 24fps，切后台自动暂停省电；尊重系统「减弱动态效果」。
- **实时月相与月位**：夜间天气动效中的月亮位置与形态均按真实天文数据渲染。位置由 Jean Meeus 简化算法（精度约 1°）计算当前时刻月球的高度角与方位角，再映射到画布坐标（月在地平线以下则不显示）；月相由日月黄经差（朔望月 29.53 天周期）计算照亮比例，通过「明面半圆 + 暗面半椭圆终止线」路径绘制新月/蛾眉/上弦/盈凸/满月/亏凸/下弦/残月八个相位，满月时大气散射光晕最亮，新月附近月轮自动隐藏。
- **气象预警信号**：当前生效的预警信号以彩色 chip 行呈现（蓝/黄/橙/红四级配色），按严重程度排序，出现在 hero 正下方；数据来自和风天气 `/v7/warning/now`。
- **分钟级降水强度**：仿苹果天气「下一小时降水量」——文字摘要升为大号主标题，下方用**平滑贝塞尔面积图**（5 分钟精度、12 点）渲染未来一小时降水强度曲线，浅蓝→深蓝渐变填充叠水平虚线参考网格，时间轴现在/15/30/45/1 小时五点刻度。数据来自和风天气 `/v7/minutely/5m`。
- **苹果天气式首屏**：城市名置于温度总揽区顶部，上滑时三阶段动效——①城市名 + 天气状况 + 高低温淡出（0–80px）、②温度数字缩小并向上飞入吸顶栏同步淡变（80–180px）、③整体视差上移淡出；吸顶栏显示「城市 · 温度°」，滞后阈值防止边界抖动（显示 >80px，隐藏 <60px）。
- **横滑切城市**：左右滑动在番禺区 / 安福县间切换（触发阈值 45px 真实手势位移），底部页面圆点指示当前页、点按可直接跳转。
- **下拉刷新 + 自动刷新**：下拉手势显示圆弧进度环（随下拉距离填充、松手触发阈值时提亮），触发后过渡为旋转加载环并随内容一起弹簧收起；回到前台超 5 分钟或每 10 分钟自动刷新。
- **番禺本地预报**：广州市气象局源附带「番禺区气象台」短时预报，**结构化解析**为时间窗口 / 天气现象 / 风力 / 温度 / 提示分字段展示，并带**时效检测**——超出预报窗口（北京时）自动隐藏，前端与服务端双重过滤。
- **苹果设计语言**：对齐 SwiftUI 的 materials 材质分层、spring 动画曲线、vibrancy 振动文字、squircle 连续圆角、44pt 触控热区、统一图标光学权重；上滑时顶部以「向下渐隐的天空遮罩」吸顶（非硬边毛玻璃条）、随天气切换的动态状态栏配色。
- **iOS 沉浸**：`viewport-fit=cover` + `apple-mobile-web-app-*`，「添加到主屏」后状态栏沉浸。
- **桌面小组件**：Scriptable 组件（中/小号），仿苹果天气布局——地名 + 平均气温 + 天气 + 最高/最低，并显示**美国 AQI 评级**。
- **天气主题图标**：PWA 自带天气图标（深蓝渐变 + 发光太阳 + 白云），含 iOS `apple-touch-icon` 与 Android maskable。

## 已接入的信源

天气信源（展示顺序固定如下）：

| 信源 | 密钥 | 覆盖 | 说明 |
|------|------|------|------|
| **中央气象台**（nmc.cn） | 否 | 全部 | 国家气象中心官方数据，按城市名经 `/essearch/api/autocomplete` 匹配站点编码后取实况 |
| **广州市气象局·番禺**（tqyb.com.cn） | 否 | 仅番禺 | 抓取官方数据文件，含番禺站实况 + 番禺区气象台短时预报 |
| **中国天气网**（weather.com.cn） | 否 | 全部 | 气象局旗下，`d1.weather.com.cn/sk_2d/{城市码}.html`，区县级实况（需 Referer，走代理） |
| **腾讯天气**（wis.qq.com） | 否 | 全部 | 按省/市/区县名查 observe 实况，无需密钥 |
| **和风天气** | 是 | 全部 | 注册 [dev.qweather.com](https://dev.qweather.com) 免费开发版；提供紫外线指数、**气象预警信号**、**分钟级降水**（免费开发版均可用） |
| **彩云天气** | 是 | 全部 | 申请 [platform.caiyunapp.com](https://platform.caiyunapp.com) token；提供紫外线指数 |
| **OpenWeatherMap** | 是 | 全部 | [openweathermap.org](https://openweathermap.org/api) 免费注册（免费层） |

美国标准 AQI 信源（均免密钥，抓取站点页解析）：

| 信源 | 站点（番禺 / 安福） | 数据 |
|------|------|------|
| **在意空气**（air-quality.com） | 番禺大学城 / 安福县文化广场 | US AQI、主要污染物（按各污染物贡献度 ratio 取最大）、PM2.5、每日 AQI 预报 |
| **IQAir**（iqair.cn） | 番禺大学城 / 安福县环保局 | US AQI、主要污染物、每日 AQI 预报 |

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

## 原生 iOS App

`ios/` 目录是与 PWA 功能、设计语言对齐的原生版本（SwiftUI + SpriteKit，iOS 17+）。得益于 `URLSession` 无 CORS 限制，**所有数据源均在设备上直接抓取，不依赖任何后端**（番禺核心源开箱即用、无需 key）。还附带 **WidgetKit 桌面小组件**（小 + 中尺寸，复用同一数据层，长按可切番禺 / 安福）。构建与详细说明见 [`ios/README.md`](ios/README.md)（`xcodegen generate` 生成工程后用 Xcode 运行）。

## iOS 桌面小组件（Scriptable）

1. App Store 安装 [Scriptable](https://scriptable.app)。
2. 用 Safari 打开 `https://<你的域名>/WeatherWidget.js`，全选复制，粘进 Scriptable 新建脚本（避免从富文本复制导致引号被转义）。
   - 如需自动更新，可改用加载器：`const code = await new Request("https://<你的域名>/WeatherWidget.js").loadString(); await eval("(async()=>{"+code+"})()")`。
3. 桌面添加 Scriptable 中号组件 → 编辑 → 选该脚本 → Parameter 填 `0`（番禺）或 `1`（安福）。
4. 数据来自聚合接口 `/api/widget?lat=&lon=&name=&cityName=`（服务端并发拉各信源，免 CORS）。

## 架构

- **信源抽象**：`src/providers/types.ts` 定义统一的 `WeatherProvider`/`CurrentWeather`（天气）与 `AqiProvider`/`AirQuality`（空气质量）模型。
  - `appliesTo(loc)` 可选方法用于限定信源覆盖范围（如广州市气象局仅在番禺展示、AQI 源仅在配置了站点路径的城市展示）。
- **新增信源**：在 `src/providers/` 新建适配器并在 `src/providers/index.ts` 的 `PROVIDERS`（天气）或 `AQI_PROVIDERS`（空气）里登记即可（数组顺序即展示顺序），UI 无需改动。
- **统计与排行**：`src/App.tsx` 的 `analyze()` 计算平均/极值、多数天气与体感/湿度/紫外线多源均值，`MetricTiles` 渲染关键指标卡、`TempRanking` 渲染温度排行；`fetchAll`/`fetchAllAqi` 并发拉取天气与 AQI。
- **天气图标**：`src/WeatherIcon.tsx` 提供 SF Symbols 风格的内联 SVG 天气图标，按天气文字 + 昼夜自动选择图标类型，支持晴/多云/阴/雨/雪/雷/雾等全部天气类型。
- **天气动效**：`src/WeatherFX.tsx` 用单 canvas + `requestAnimationFrame` 粒子系统，按 `fxKind(天气文字, 昼夜)` 映射到对应特效；云朵预先烘焙为离屏贴图（SVG turbulence 滤镜，载入前 canvas 模糊回退），分远/中/近三层景深，日出/日落时受光面自动染暖，切后台暂停、慢动效降帧、resize 重映射粒子坐标。
- **性能**：手势拖动/下拉每帧更新 App 状态，`AqiSection`/`ProviderCard`/`TempRanking`/`MetricTiles` 用 `React.memo` 包裹，数据未变时不随手势重渲染。
- **密钥**：`src/providers/keys.ts` 仅读取构建时注入的 `VITE_*` 环境变量。
- **服务端逻辑**（CORS 代理 / 页面抓取 / 聚合）放在 `functions/`（Cloudflare Pages Functions）：
  - `functions/proxy/[[path]].ts`：通用反向代理（nmc / weathercn（补 Referer）/ tencent / qweather / caiyun），转发请求方法与请求体。
  - `functions/api/gz/realtime.ts` + `functions/_lib/gz.ts`：广州市气象局·番禺 数据抓取（含短时预报时效检测）。
  - `functions/api/widget.ts`：小组件聚合接口，服务端并发拉天气各信源 + 在意空气/IQAir 的 AQI 并归一化。
  - `functions/api/aqi.ts` + `functions/_lib/aqi.ts`：美国标准 AQI 服务端抓取与聚合（在意空气 air-quality.com + IQAir iqair.cn），精确到本地监测站，前端无需下载整页 HTML。
  - OpenWeatherMap 支持 CORS，前端直连，无需代理。
  - 开发环境由 `vite.config.ts` 的代理与 dev 插件复用同一套逻辑，本地无需 wrangler。

## 广州市气象局·番禺 数据来源

页面 `http://www.tqyb.com.cn/gzpanyu/` 由 `require.js` 驱动，实况/预报来自若干 `try{ var X = {...};}catch(e){}` 形式的数据文件（UTF-8 编码），`functions/_lib/gz.ts` 据此抓取并归一化：

- `/data/latestWeather/gz_latestWeather.js`：`gzObtInfo`（番禺本地站）为主、`baseObtInfo`（广州基本站 59287）备用，提供温度/湿度/风/时雨量（`-999.9` 为缺测）。
- `/data/shorttime/GDPY_shorttime.js`：番禺区气象台短时预报文字；过期（超出预报窗口）则不返回。
