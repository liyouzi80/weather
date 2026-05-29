# 天气多信源对比

一个移动端优先的 Web 应用（可安装为 PWA），把**多个天气信源**的同城实时数据并排展示，方便对比差异。

## 已接入的信源

| 信源 | 是否需密钥 | 说明 |
|------|-----------|------|
| **Open-Meteo** | 否 | 免费、支持跨域，开箱即用，作为默认源 |
| **中央气象台**（nmc.cn） | 否 | 中国气象局国家气象中心官方数据，按城市名匹配站点 |
| **和风天气** | 是 | 注册 [dev.qweather.com](https://dev.qweather.com) 免费开发版 |
| **彩云天气** | 是 | 申请 [platform.caiyunapp.com](https://platform.caiyunapp.com) token |
| **广州市气象局** | 是 | 区域性信源，仅覆盖广州地区（接口待接入，见下） |

## 快速开始

```bash
npm install
cp .env.example .env   # 可选：填入密钥；也可在应用「设置」里临时填
npm run dev            # 打开终端提示的地址（手机同 WiFi 可用局域网地址访问）
```

构建生产版本：`npm run build`，产物在 `dist/`。

## 架构

- **信源抽象**：`src/providers/types.ts` 定义统一的 `WeatherProvider` 接口和 `CurrentWeather` 数据模型。
- **新增信源**：在 `src/providers/` 下新建一个适配器实现 `WeatherProvider`，再在 `src/providers/index.ts` 的 `PROVIDERS` 数组里登记即可，UI 无需改动。
- **密钥管理**：`src/providers/keys.ts`，优先读 `.env`（`VITE_*`），其次读应用「设置」里存到 localStorage 的值。
- **并发拉取**：`fetchAll()` 并发请求所有「已配置」信源，失败的也会返回错误并在卡片上展示。

## 关于跨域（CORS）与代理

和风、彩云、中央气象台、广州市气象局的接口在浏览器直连会被 CORS 拦截。
开发环境已通过 `vite.config.ts` 里的代理（`/proxy/qweather`、`/proxy/caiyun`、`/proxy/nmc`、`/proxy/gzqx`）转发。
**生产部署需要自备同样的反向代理**（如 Nginx / Cloudflare Workers / Vercel rewrites），把这些路径转发到对应上游域名。

## 待办：广州市气象局接口

`src/providers/gzqx.ts` 目前是带 `TODO` 的占位实现。拿到广州市气象局的真实接口后，
替换 `fetchCurrent` 内部逻辑（接口地址、入参、字段映射）即可，对外的统一模型保持不变。
