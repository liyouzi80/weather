// API 密钥：仅读取构建时注入的环境变量（.env / 部署平台的环境变量）。
// 应用内不再提供密钥录入界面；需要密钥的信源在构建时配置好对应 VITE_* 即可启用，
// 未配置则该信源自动不参与对比。

export type KeyId = 'qweather' | 'caiyun' | 'owm' | 'weatherapi' | 'iqair' | 'waqi'

const ENV_KEYS: Record<KeyId, string | undefined> = {
  qweather: import.meta.env.VITE_QWEATHER_KEY as string | undefined,
  caiyun: import.meta.env.VITE_CAIYUN_KEY as string | undefined,
  owm: import.meta.env.VITE_OWM_KEY as string | undefined,
  weatherapi: import.meta.env.VITE_WEATHERAPI_KEY as string | undefined,
  iqair: import.meta.env.VITE_IQAIR_KEY as string | undefined,
  waqi: import.meta.env.VITE_WAQI_TOKEN as string | undefined,
}

export function getKey(id: KeyId): string | undefined {
  return ENV_KEYS[id]?.trim() || undefined
}
