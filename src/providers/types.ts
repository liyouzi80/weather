// 统一的天气数据模型 —— 各信源适配器负责把自己的返回结果映射成这套结构。

export interface GeoLocation {
  name: string // 显示名称，如「北京市 朝阳区」
  lat: number
  lon: number
  /** 纯城市名（如「广州」），供按编码检索的官方信源做站点匹配 */
  cityName?: string
}

export interface CurrentWeather {
  /** 摄氏温度 */
  temp: number
  /** 体感温度，可选 */
  feelsLike?: number
  /** 天气文字描述，如「多云」 */
  text: string
  /** 相对湿度，百分比 */
  humidity?: number
  /** 风速，km/h */
  windSpeed?: number
  /** 风向描述 */
  windDir?: string
  /** 数据观测/更新时间（ISO 字符串） */
  observedAt?: string
}

/** 各信源拉取后的统一结果（成功或失败） */
export interface ProviderResult {
  providerId: string
  providerName: string
  /** 成功时有数据 */
  current?: CurrentWeather
  /** 失败时的错误信息 */
  error?: string
}

/** 一个天气信源需要实现的接口 */
export interface WeatherProvider {
  id: string
  /** 展示名称 */
  name: string
  /** 信源主色，用于 UI 区分 */
  color: string
  /** 是否需要 API 密钥才能工作 */
  requiresKey: boolean
  /** 当前是否已配置可用（无需密钥的恒为 true） */
  isConfigured(): boolean
  /** 拉取某坐标的实时天气 */
  fetchCurrent(loc: GeoLocation): Promise<CurrentWeather>
}
