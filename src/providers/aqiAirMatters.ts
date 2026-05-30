// 在意空气（Air Matters，英文站 air-quality.com）—— 美国标准 AQI。
// 按站点页 place_id 精确取数（番禺→番禺大学城、安福→安福县文化广场）。
// 站点页服务端渲染：meta 有「AQI (美国标准) 45 良好」；reading-box 每个污染物带
// ratio-bar 相对贡献（取最大者为主要污染物）；下方有每日 AQI 预报（范围+等级）。
// 浏览器跨域受限，经服务端代理 /proxy/airquality 转发。
import type { AirQuality, AqiProvider, GeoLocation } from './types'

// 污染物名规范化为带下标的展示形式
const POL: Record<string, string> = {
  O3: 'O₃', PM25: 'PM2.5', 'PM2.5': 'PM2.5', PM10: 'PM10', NO2: 'NO₂', SO2: 'SO₂', CO: 'CO',
}
const norm = (n: string) => POL[n] ?? n

const CATS = '优|良好|良|中等|轻度污染|中度污染|重度污染|严重污染|对敏感人群不健康|不健康|非常不健康|危险|危害'

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

    // 各污染物：名称 + 浓度 + ratio（相对贡献）。取 ratio 最大者为主要污染物。
    const items = [
      ...html.matchAll(
        /<div class='name'>([^<]+)<\/div><div class='unit'>[^<]*<\/div><div class='value'>([\d.]+)<\/div><div class='ratio-bar' style='[^']*\*([\d.]+)\)/g,
      ),
    ].map((x) => ({ name: x[1], value: parseFloat(x[2]), ratio: parseFloat(x[3]) }))
    const dom = items.length ? items.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined
    const pm = items.find((i) => i.name === 'PM2.5')

    // 每日 AQI 预报（范围 + 等级），取今明两天
    const s = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const days = [
      ...s.matchAll(new RegExp(`\\d{4}-\\d{2}-\\d{2}[^0-9]*?\\d+°[^0-9]*?\\d+°[^0-9]*?\\d+°[^~]*?(\\d+)~(\\d+)\\s*(${CATS})`, 'g')),
    ]
    let forecast: string | undefined
    if (days.length) {
      const today = `今 ${days[0][1]}~${days[0][2]}`
      const tmr = days[1] ? ` · 明 ${days[1][1]}~${days[1][2]}` : ''
      forecast = today + tmr
    }

    return {
      aqi,
      dominant: dom ? norm(dom.name) : undefined,
      pm25: pm ? pm.value : undefined,
      forecast,
    }
  },
}
