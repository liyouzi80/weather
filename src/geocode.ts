// 城市搜索（地理编码）：用 Open-Meteo 免费地理编码 API，返回中文城市名与经纬度。
import type { GeoLocation } from './providers/types'

interface GeoApiItem {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
  admin2?: string
}

export async function searchCity(query: string): Promise<GeoLocation[]> {
  const q = query.trim()
  if (!q) return []
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=8&language=zh&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`搜索失败 HTTP ${res.status}`)
  const data = await res.json()
  const results: GeoApiItem[] = data.results ?? []
  return results.map((r) => ({
    name: [r.admin1, r.admin2, r.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' '),
    cityName: r.name,
    lat: r.latitude,
    lon: r.longitude,
  }))
}
