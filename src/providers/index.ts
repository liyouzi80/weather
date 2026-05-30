// 信源注册表：在这里登记所有信源。新增信源只需实现 WeatherProvider 并加进数组。
import type { AqiResult, GeoLocation, ProviderResult, WeatherProvider } from './types'
import { qweatherProvider } from './qweather'
import { caiyunProvider } from './caiyun'
import { nmcProvider } from './nmc'
import { gzqxProvider } from './gzqx'
import { weathercnProvider } from './weathercn'
import { tencentProvider } from './tencent'
import { owmProvider } from './owm'

// 展示顺序：中央气象局 / 番禺气象台 / 中国天气网 / 腾讯天气 / 和风 / 彩云 / openweathermap
export const PROVIDERS: WeatherProvider[] = [
  nmcProvider,
  gzqxProvider,
  weathercnProvider,
  tencentProvider,
  qweatherProvider,
  caiyunProvider,
  owmProvider,
]

const FETCH_TIMEOUT = 8000

const timeout = (ms: number): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), ms))

/** 并发拉取所有「已配置」信源，逐个返回结果（失败也返回，便于 UI 展示错误） */
export async function fetchAll(loc: GeoLocation): Promise<ProviderResult[]> {
  const active = PROVIDERS.filter((p) => p.isConfigured() && (p.appliesTo?.(loc) ?? true))
  return Promise.all(
    active.map(async (p): Promise<ProviderResult> => {
      try {
        const current = await Promise.race([p.fetchCurrent(loc), timeout(FETCH_TIMEOUT)])
        return { providerId: p.id, providerName: p.name, current }
      } catch (e) {
        return {
          providerId: p.id,
          providerName: p.name,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }),
  )
}

interface AqiApiSource {
  id: string
  name: string
  color: string
  aqi?: number
  dominant?: string
  pm25?: number
  observedAt?: string
  url?: string
  error?: string
}

/** 美国 AQI：调用服务端 /api/aqi（服务端抓站点页并归一化，避免浏览器下载整页 HTML） */
export async function fetchAllAqi(loc: GeoLocation): Promise<{ sources: AqiResult[] }> {
  const city = loc.cityName ?? loc.name
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`/api/aqi?cityName=${encodeURIComponent(city)}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { sources?: AqiApiSource[] }
    const sources = (data.sources ?? []).map((s) =>
      s.error || s.aqi == null
        ? { providerId: s.id, providerName: s.name, color: s.color, url: s.url, error: s.error ?? '无数据' }
        : {
            providerId: s.id,
            providerName: s.name,
            color: s.color,
            url: s.url,
            air: { aqi: s.aqi, dominant: s.dominant, pm25: s.pm25, observedAt: s.observedAt },
          },
    )
    return { sources }
  } catch {
    return { sources: [] }
  } finally {
    clearTimeout(timer)
  }
}

export * from './types'
