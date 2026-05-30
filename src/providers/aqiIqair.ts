// IQAir（AirVisual）—— 美国标准 aqius。需免费 Community key（VITE_IQAIR_KEY）。
// 经服务端代理 /proxy/airvisual 转发，规避 CORS。未配置 key 则不参与对比。
import type { AirQuality, AqiProvider, GeoLocation } from './types'
import { getKey } from './keys'

const MAINUS: Record<string, string> = {
  p2: 'PM2.5', p1: 'PM10', o3: '臭氧', n2: '二氧化氮', s2: '二氧化硫', co: '一氧化碳',
}

export const iqairAqiProvider: AqiProvider = {
  id: 'iqair',
  name: 'IQAir',
  color: '#0ea5e9',
  requiresKey: true,
  isConfigured: () => !!getKey('iqair'),
  async fetchAqi(loc: GeoLocation): Promise<AirQuality> {
    const key = getKey('iqair')
    if (!key) throw new Error('未配置 IQAir key')
    const res = await fetch(`/proxy/airvisual/v2/nearest_city?lat=${loc.lat}&lon=${loc.lon}&key=${key}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    if (d.status !== 'success') throw new Error(d?.data?.message || `status=${d.status}`)
    const pol = d.data?.current?.pollution
    if (!pol || pol.aqius == null) throw new Error('无 aqius 数据')
    return {
      aqi: pol.aqius,
      dominant: MAINUS[pol.mainus] || undefined,
      observedAt: pol.ts,
    }
  },
}
