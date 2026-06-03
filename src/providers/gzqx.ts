// 广州市气象局（番禺）—— 数据来自抓取官方页面 http://www.tqyb.com.cn/gzpanyu/ 。
// 浏览器无法直接抓取并解析该页面（CORS + HTML 解析），
// 因此实际抓取在服务端完成：
//   - 生产：Cloudflare Pages Function  functions/api/gz/realtime.ts
//   - 开发：vite 开发插件（见 vite.config.ts），复用同一套解析逻辑
// 前端只需请求统一的 /api/gz/realtime 即可拿到归一化后的 JSON。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

export const gzqxProvider: WeatherProvider = {
  id: 'gzqx',
  name: '番禺气象台',
  color: '#a855f7',
  requiresKey: false,
  isConfigured: () => true,
  // 广州市气象局·番禺数据仅覆盖番禺，其它城市不展示本信源。
  appliesTo: (loc: GeoLocation) => loc.cityName === '番禺',
  async fetchCurrent(_loc: GeoLocation): Promise<CurrentWeather> {
    const res = await fetch('/api/gz/realtime')
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`)
    const d = await res.json()
    if (d.error) throw new Error(d.error)
    if (d.temp == null) throw new Error('未解析到温度（页面结构可能已变）')
    // 基本站实况没有天气现象描述（text 始终 undefined）；若预报也不在时效内、
    // 且无生效预警，卡片无实质内容，静默隐藏（与其他失败信源处理一致）。
    // 注意：预警/预报经 current 透传给独立卡片，故有任一时仍需保留 current。
    if (!d.text && !d.forecast && !d.warnings?.length) throw new Error('无有效天气内容')
    return {
      temp: d.temp,
      feelsLike: d.feelsLike,
      text: d.text ?? '—',
      humidity: d.humidity,
      windSpeed: d.windSpeed,
      windDir: d.windDir,
      observedAt: d.observedAt,
      forecast: d.forecast,
      forecastIssuedAt: d.forecastIssuedAt,
      warnings: d.warnings,
    }
  },
}
