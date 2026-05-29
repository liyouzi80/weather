// API 密钥管理：优先读取构建时注入的环境变量（.env），
// 同时支持用户在页面「设置」里临时填写，存到 localStorage。
// 这样既能本地开发用 .env，也能让没有改代码能力的用户即填即用。

export type KeyId = 'qweather' | 'caiyun' | 'twc'

const LS_PREFIX = 'weather_key_'

const ENV_KEYS: Record<KeyId, string | undefined> = {
  qweather: import.meta.env.VITE_QWEATHER_KEY as string | undefined,
  caiyun: import.meta.env.VITE_CAIYUN_KEY as string | undefined,
  twc: import.meta.env.VITE_TWC_KEY as string | undefined,
}

export function getKey(id: KeyId): string | undefined {
  const fromLs = localStorage.getItem(LS_PREFIX + id)?.trim()
  if (fromLs) return fromLs
  const fromEnv = ENV_KEYS[id]?.trim()
  return fromEnv || undefined
}

export function setKey(id: KeyId, value: string): void {
  const v = value.trim()
  if (v) localStorage.setItem(LS_PREFIX + id, v)
  else localStorage.removeItem(LS_PREFIX + id)
}
