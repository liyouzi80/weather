// 统一的天气数据模型 —— 各信源适配器负责把自己的返回结果映射成这套结构。

export interface GeoLocation {
  name: string // 显示名称，如「北京市 朝阳区」
  lat: number
  lon: number
  /** 纯城市名（如「广州」），供按编码检索的官方信源做站点匹配 */
  cityName?: string
  /** 中国天气网（weather.com.cn）城市码，如「101280102」 */
  weatherCnCode?: string
  /** 腾讯天气按省/市/区县中文名检索 */
  tencent?: { province: string; city: string; county: string }
  /** 在意空气（air-quality.com）站点页路径，如「place/china/fanyudaxuecheng/3b401494」 */
  airMatters?: { path: string }
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
  /** 官方文字预报补充（如番禺区气象台短时预报），可选 */
  forecast?: string
  /** 文字预报发布时间（原始字符串），可选 */
  forecastIssuedAt?: string
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
  /** 该信源是否适用于给定地点（如本地气象局仅覆盖其辖区）。缺省视为通用。 */
  appliesTo?(loc: GeoLocation): boolean
  /** 拉取某坐标的实时天气 */
  fetchCurrent(loc: GeoLocation): Promise<CurrentWeather>
}

/** 美国标准空气质量（US AQI）数据模型 */
export interface AirQuality {
  /** 美国 AQI 数值 */
  aqi: number
  /** 主要污染物中文名（如「PM2.5」「臭氧」），可选 */
  dominant?: string
  /** PM2.5 浓度 μg/m³（部分源提供），可选 */
  pm25?: number
  /** 数据观测/更新时间（ISO 字符串），可选 */
  observedAt?: string
}

/** AQI 信源拉取结果 */
export interface AqiResult {
  providerId: string
  providerName: string
  color: string
  air?: AirQuality
  error?: string
}

/** 一个 AQI 信源需要实现的接口 */
export interface AqiProvider {
  id: string
  name: string
  color: string
  requiresKey: boolean
  isConfigured(): boolean
  appliesTo?(loc: GeoLocation): boolean
  fetchAqi(loc: GeoLocation): Promise<AirQuality>
}
