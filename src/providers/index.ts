// 信源注册表：在这里登记所有信源。新增信源只需实现 WeatherProvider 并加进数组。
import type { GeoLocation, ProviderResult, WeatherProvider } from './types'
import { openMeteoProvider } from './openMeteo'
import { qweatherProvider } from './qweather'
import { caiyunProvider } from './caiyun'
import { nmcProvider } from './nmc'
import { gzqxProvider } from './gzqx'
import { owmProvider } from './owm'
import { weatherapiProvider } from './weatherapi'

// 展示顺序：中央气象局 / 广州市气象局 / 和风 / 彩云 / openweathermap / weatherapi / open-meteo
export const PROVIDERS: WeatherProvider[] = [
  nmcProvider,
  gzqxProvider,
  qweatherProvider,
  caiyunProvider,
  owmProvider,
  weatherapiProvider,
  openMeteoProvider,
]

/** 并发拉取所有「已配置」信源，逐个返回结果（失败也返回，便于 UI 展示错误） */
export async function fetchAll(loc: GeoLocation): Promise<ProviderResult[]> {
  const active = PROVIDERS.filter((p) => p.isConfigured() && (p.appliesTo?.(loc) ?? true))
  return Promise.all(
    active.map(async (p): Promise<ProviderResult> => {
      try {
        const current = await p.fetchCurrent(loc)
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

export type { WeatherProvider, ProviderResult, GeoLocation }
export * from './types'
