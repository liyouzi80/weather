// IQAir（AirVisual 官网 iqair.cn）—— 美国标准 AQI，免密钥。
// 站点页服务端渲染：「30 美国 AQI 优秀 主要污染物: O₃ 76 µg/m³」，并含每日 AQI 预报
//（今天 113 周日 114 …）。按城市站点路径抓取，经服务端代理 /proxy/iqaircn 转发。
import type { AirQuality, AqiProvider, GeoLocation } from './types'

const CAT = '优秀|优|良好|良|中等|对敏感人群不健康|不健康|非常不健康|危险|危害'

export const iqairAqiProvider: AqiProvider = {
  id: 'iqair',
  name: 'IQAir',
  color: '#0ea5e9',
  requiresKey: false,
  isConfigured: () => true,
  appliesTo: (loc: GeoLocation) => !!loc.iqair,
  async fetchAqi(loc: GeoLocation): Promise<AirQuality> {
    if (!loc.iqair) throw new Error('缺少站点')
    const res = await fetch(`/proxy/iqaircn/${loc.iqair.path}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const s = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    const m = s.match(new RegExp(`(\\d+)\\s*美国 AQI⁺?\\s*(?:${CAT})\\s*主要污染物[：:]\\s*(\\S+)\\s*([\\d.]+)\\s*µg`))
    let aqi: number
    let dominant: string | undefined
    let pm25: number | undefined
    if (m) {
      aqi = parseInt(m[1])
      dominant = m[2]
      const conc = parseFloat(m[3])
      pm25 = m[2].includes('2.5') ? conc : undefined
    } else {
      const loose = s.match(/(\d+)\s*美国 AQI/)
      if (!loose) throw new Error('未解析到 AQI（页面结构可能已变）')
      aqi = parseInt(loose[1])
    }

    // 每日 AQI 预报（今天/明天/周X），取今明两天
    const fi = s.indexOf('每日预报')
    const seg = fi >= 0 ? s.slice(fi, fi + 280) : ''
    const days = [...seg.matchAll(/(今天|明天|周[一二三四五六日])\s+(\d+)\s+\d+°/g)]
    let forecast: string | undefined
    if (days.length) {
      const today = `今 ${days[0][2]}`
      const tmr = days[1] ? ` · 明 ${days[1][2]}` : ''
      forecast = today + tmr
    }

    return { aqi, dominant, pm25, forecast }
  },
}
