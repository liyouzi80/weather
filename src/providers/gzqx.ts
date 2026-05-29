// 广州市气象局（广州市气象台 tqyb.com.cn）。
// 区域性信源：基本只覆盖广州/广东一带。需要接口地址与密钥（用户提供中）。
//
// ⚠️ 占位实现：等拿到广州市气象局的真实接口后，替换 fetchCurrent 内部逻辑即可，
//    对外的统一模型（CurrentWeather）保持不变，UI 无需改动。
//
// 开发环境经 vite 代理 /proxy/gzqx 转发到 https://www.tqyb.com.cn（避免 CORS）。
import type { CurrentWeather, GeoLocation, WeatherProvider } from './types'
import { getKey } from './keys'

const BASE = '/proxy/gzqx'

// 广州大致范围，超出则认为该信源无覆盖
function inGuangzhou(loc: GeoLocation): boolean {
  return loc.lat > 22.4 && loc.lat < 24.0 && loc.lon > 112.9 && loc.lon < 114.1
}

export const gzqxProvider: WeatherProvider = {
  id: 'gzqx',
  name: '广州市气象局',
  color: '#a855f7',
  requiresKey: true,
  isConfigured: () => !!getKey('gzqx'),
  async fetchCurrent(loc: GeoLocation): Promise<CurrentWeather> {
    const key = getKey('gzqx')
    if (!key) throw new Error('未配置广州市气象局接口密钥')
    if (!inGuangzhou(loc)) throw new Error('该信源仅覆盖广州地区')

    // TODO: 替换为广州市气象局的真实接口。示意：
    //   const url = `${BASE}/api/realtime?lon=${loc.lon}&lat=${loc.lat}&key=${key}`
    //   const res = await fetch(url)
    //   if (!res.ok) throw new Error(`HTTP ${res.status}`)
    //   const data = await res.json()
    //   return {
    //     temp: data.temperature,
    //     text: data.weather,
    //     humidity: data.humidity,
    //     windSpeed: data.windSpeed,
    //     windDir: data.windDir,
    //     observedAt: data.time,
    //   }
    void BASE
    throw new Error('广州市气象局接口待接入（占位）')
  },
}
