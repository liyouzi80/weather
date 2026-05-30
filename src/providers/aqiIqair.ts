// IQAir（AirVisual 官网 iqair.cn）—— 美国标准 AQI，免密钥。
// 站点页服务端渲染当前读数（「30 美国 AQI 优秀 主要污染物: O₃ 76 µg/m³」），
// 按城市配置的站点路径抓取，经服务端代理 /proxy/iqaircn 转发规避 CORS。
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
    if (m) {
      const pollutant = m[2]
      const conc = parseFloat(m[3])
      return {
        aqi: parseInt(m[1]),
        dominant: pollutant,
        pm25: pollutant.includes('2.5') ? conc : undefined,
      }
    }
    // 兜底：仅取 AQI 数值
    const loose = s.match(/(\d+)\s*美国 AQI/)
    if (!loose) throw new Error('未解析到 AQI（页面结构可能已变）')
    return { aqi: parseInt(loose[1]) }
  },
}
