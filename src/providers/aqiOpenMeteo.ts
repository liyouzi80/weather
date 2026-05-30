// Open-Meteo 空气质量 —— 免密钥、支持 CORS，直接给美国标准 us_aqi。
import type { AirQuality, AqiProvider, GeoLocation } from './types'

export const openMeteoAqiProvider: AqiProvider = {
  id: 'openmeteo-aqi',
  name: 'Open-Meteo',
  color: '#22c55e',
  requiresKey: false,
  isConfigured: () => true,
  async fetchAqi(loc: GeoLocation): Promise<AirQuality> {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=us_aqi,pm2_5&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    const c = d.current
    if (!c || c.us_aqi == null) throw new Error('无 us_aqi 数据')
    return {
      aqi: Math.round(c.us_aqi),
      pm25: c.pm2_5 != null ? Math.round(c.pm2_5 * 10) / 10 : undefined,
      observedAt: c.time,
    }
  },
}
