// 在意空气（Air Matters，英文站 air-quality.com）—— 美国标准 AQI。
// 按站点页 place_id 精确取数（番禺→番禺大学城、安福→安福县文化广场），
// 站点页服务端渲染：meta 里有「AQI (美国标准) 45 良好」，reading-box 里有各污染物浓度。
// 浏览器跨域受限，经服务端代理 /proxy/airquality 转发。
import type { AirQuality, AqiProvider, GeoLocation } from './types'

export const airMattersAqiProvider: AqiProvider = {
  id: 'airmatters',
  name: '在意空气',
  color: '#f59e0b',
  requiresKey: false,
  isConfigured: () => true,
  appliesTo: (loc: GeoLocation) => !!loc.airMatters,
  async fetchAqi(loc: GeoLocation): Promise<AirQuality> {
    if (!loc.airMatters) throw new Error('缺少站点')
    const res = await fetch(`/proxy/airquality/${loc.airMatters.path}?lang=zh-Hans&standard=aqi_us`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const m = html.match(/AQI \(美国标准\)\s*(\d+)/)
    if (!m) throw new Error('未解析到 AQI（页面结构可能已变）')
    const aqi = parseInt(m[1])

    const strip = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const pm = strip.match(/PM2\.5[^\d]{0,12}([\d.]+)/)

    return { aqi, pm25: pm ? parseFloat(pm[1]) : undefined }
  },
}
