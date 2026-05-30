// 信源注册表：在这里登记所有信源。新增信源只需实现 WeatherProvider 并加进数组。
import type { AqiProvider, AqiResult, GeoLocation, ProviderResult, WeatherProvider } from './types'
import { openMeteoProvider } from './openMeteo'
import { qweatherProvider } from './qweather'
import { caiyunProvider } from './caiyun'
import { nmcProvider } from './nmc'
import { gzqxProvider } from './gzqx'
import { weathercnProvider } from './weathercn'
import { tencentProvider } from './tencent'
import { owmProvider } from './owm'
import { airMattersAqiProvider } from './aqiAirMatters'
import { openMeteoAqiProvider } from './aqiOpenMeteo'
import { iqairAqiProvider } from './aqiIqair'

// 展示顺序：中央气象局 / 番禺气象台 / 中国天气网 / 腾讯天气 / 和风 / 彩云 / openweathermap / open-meteo
export const PROVIDERS: WeatherProvider[] = [
  nmcProvider,
  gzqxProvider,
  weathercnProvider,
  tencentProvider,
  qweatherProvider,
  caiyunProvider,
  owmProvider,
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

// 美国标准 AQI 信源（展示顺序：在意空气 / IQAir / Open-Meteo）
export const AQI_PROVIDERS: AqiProvider[] = [
  airMattersAqiProvider,
  iqairAqiProvider,
  openMeteoAqiProvider,
]

/** 并发拉取所有「已配置」AQI 信源 */
export async function fetchAllAqi(loc: GeoLocation): Promise<AqiResult[]> {
  const active = AQI_PROVIDERS.filter((p) => p.isConfigured() && (p.appliesTo?.(loc) ?? true))
  return Promise.all(
    active.map(async (p): Promise<AqiResult> => {
      try {
        return { providerId: p.id, providerName: p.name, color: p.color, air: await p.fetchAqi(loc) }
      } catch (e) {
        return {
          providerId: p.id,
          providerName: p.name,
          color: p.color,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }),
  )
}

export type { WeatherProvider, ProviderResult, GeoLocation, AqiProvider, AqiResult }
export * from './types'
