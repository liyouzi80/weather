// 共享工具函数，供各 provider 使用。

/** 风向角度 → 中文风向（如「东北风」），无角度时返回 undefined */
export function degToDir(deg?: number): string | undefined {
  if (deg == null) return undefined
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return dirs[Math.round(deg / 45) % 8] + '风'
}
