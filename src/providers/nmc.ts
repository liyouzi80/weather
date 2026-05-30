// 中央气象台 / 中国气象局国家气象中心（www.nmc.cn）官方站点数据。
// 无需密钥，但：
//  1) 用「站点编码 stationid」而非经纬度，需先按城市名检索站点；
//  2) 接口严格限制跨域，必须经服务端代理（开发环境走 vite 代理 /proxy/nmc）。
//     生产部署需自备同样的反向代理转发到 http://www.nmc.cn 。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'

const BASE = '/proxy/nmc'

export const nmcProvider: WeatherProvider = {
  id: 'nmc',
  name: '中央气象台',
  color: '#ef4444',
  requiresKey: false,
  isConfigured: () => true,
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const keyword = (loc.cityName || loc.name || '').replace(/市$|区$|县$/g, '')
    if (!keyword) throw new Error('缺少城市名，无法匹配中央气象台站点')

    // 1) 按城市名检索站点编码（旧的 /rest/findStation 已下线，改用站点搜索接口）。
    //    返回 data 为竖线分隔的字符串数组：`编码|名称|省份|url|经度|纬度`。
    const stRes = await fetch(`${BASE}/essearch/api/autocomplete?q=${encodeURIComponent(keyword)}`)
    if (!stRes.ok) throw new Error(`检索站点失败 HTTP ${stRes.status}`)
    const stJson = await stRes.json()
    const rows: string[] = Array.isArray(stJson?.data) ? stJson.data : []
    if (rows.length === 0) throw new Error(`未找到「${keyword}」对应的气象站`)
    const stationId = rows[0].split('|')[0]
    if (!stationId) throw new Error(`「${keyword}」站点编码解析失败`)

    // 2) 拉取该站实况
    const wRes = await fetch(`${BASE}/rest/weather?stationid=${stationId}`)
    if (!wRes.ok) throw new Error(`获取实况失败 HTTP ${wRes.status}`)
    const data = await wRes.json()
    const real = data?.data?.real
    if (!real?.weather) throw new Error('无实况数据')

    const w = real.weather
    const wind = real.wind || {}
    // nmc 异常值用 9999 表示缺测
    const clean = (v: number) => (v === 9999 || v == null ? undefined : v)
    const speedMs = parseFloat(wind.speed)
    return {
      temp: w.temperature,
      feelsLike: clean(w.feelst),
      text: w.info,
      humidity: clean(w.humidity),
      windSpeed: isNaN(speedMs) ? undefined : Math.round(speedMs * 3.6 * 10) / 10, // m/s -> km/h
      windDir: wind.direct,
      // publish_time 形如「2026-05-31 10:00」（北京时）；原样写入 UTC 字段，前端按 UTC 显示
      observedAt: real.publish_time ? `${real.publish_time.replace(' ', 'T').slice(0, 16)}:00Z` : undefined,
    }
  },
}
