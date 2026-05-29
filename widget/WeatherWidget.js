// WeatherWidget.js — 多信源天气实况对比
// ===============================================
// 桌面小组件：展示所选城市的各信源实时温度对比
// 为中号组件优化，兼顾小号和大号
//
// 使用：
// 1. Scriptable App 中新建脚本，粘贴全部内容
// 2. 添加到桌面（推荐中号）
// 3. Widget Parameter：填「番禺」或「安福」
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

// 短名称映射（中号组件空间有限）
const SHORT_NAME = {
  'open-meteo': 'Open-Meteo',
  'nmc': '中央气象台',
  'gzqx': '番禺气象台',
  'qweather': '和风天气',
  'caiyun': '彩云天气',
  'owm': 'OWM',
}

const C = {
  text:    new Color('#f5f5f7'),
  text2:   new Color('#98989d'),
  dim:     new Color('#6e6e73'),
  hot:     new Color('#ff453a'),
  cold:    new Color('#40c8e0'),
  warn:    new Color('#ffd60a'),
  purple:  new Color('#a855f7'),
}

const PROVIDER_COLORS = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'qweather': '#3b82f6',
  'caiyun': '#f59e0b', 'owm': '#f97316',
  'open-meteo': '#22c55e',
}

// ── 数据 ──
let _cacheKey = '', _cacheData = null

async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _cacheKey && _cacheData) return _cacheData
  const params = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${params}`)
  req.timeoutInterval = 15
  const res = await req.loadJSON()
  _cacheKey = key
  _cacheData = res
  return res
}

// ── 背景 ──
function setBackground(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#05080f'), new Color('#0a1224'), new Color('#070d18')]
  g.locations = [0, 0.45, 1]
  w.backgroundGradient = g
}

// ──────────────── 中号 / 大号 布局 ──────────────

// 顶部：城市名 + 天气 + 信源数
function renderHeader(w, data) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const name = row.addText(data.city)
  name.font = Font.boldSystemFont(18)
  name.textColor = C.text
  name.lineLimit = 1

  row.addSpacer(6)

  if (data.text) {
    const txt = row.addText(data.text)
    txt.font = Font.mediumSystemFont(13)
    txt.textColor = C.text2
    txt.lineLimit = 1
  }

  row.addSpacer()

  const badge = row.addText(`${data.count}/${data.total}`)
  badge.font = Font.mediumSystemFont(10)
  badge.textColor = C.dim
}

// 统计摘要行：最高 / 中位 / 最低 / 分歧
function renderSummary(w, data) {
  if (data.count < 2) return
  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  row.spacing = 10

  const hi = row.addText(`${data.max}°`)
  hi.font = Font.boldSystemFont(12)
  hi.textColor = C.hot

  const med = row.addText(`中位 ${data.median != null ? data.median.toFixed(1) : '—'}°`)
  med.font = Font.mediumSystemFont(11)
  med.textColor = C.text2

  const lo = row.addText(`${data.min}°`)
  lo.font = Font.boldSystemFont(12)
  lo.textColor = C.cold

  row.addSpacer()

  const spread = data.max - data.min
  if (spread > 0) {
    const sp = row.addText(`分歧 ${spread.toFixed(1)}°`)
    sp.font = Font.mediumSystemFont(10)
    sp.textColor = spread >= 2 ? C.warn : C.dim
  }
}

// 单行信源条目（紧凑版）
function renderRow(w, p, median, max, min, hasMultiple) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  // 彩色圆点
  const hex = PROVIDER_COLORS[p.id] || '#6e6e73'
  const dot = row.addText('●')
  dot.font = Font.regularSystemFont(8)
  dot.textColor = new Color(hex)
  dot.lineLimit = 1

  row.addSpacer(5)

  // 名称
  const label = row.addText(SHORT_NAME[p.id] || p.name)
  label.font = Font.mediumSystemFont(12)
  label.textColor = p.error ? C.dim : C.text
  label.lineLimit = 1

  row.addSpacer(4)

  // 最高/最低标签
  if (p.temp != null && hasMultiple && max !== min) {
    if (p.temp === max) {
      const tag = row.addText('最高')
      tag.font = Font.boldSystemFont(8)
      tag.textColor = C.hot
    } else if (p.temp === min) {
      const tag = row.addText('最低')
      tag.font = Font.boldSystemFont(8)
      tag.textColor = C.cold
    }
    row.addSpacer(4)
  }

  row.addSpacer()

  // 温度
  if (p.error) {
    const err = row.addText('—')
    err.font = Font.semiboldSystemFont(14)
    err.textColor = C.dim
  } else {
    const temp = row.addText(`${p.temp}°`)
    temp.font = Font.boldSystemFont(15)
    if (p.temp === max && hasMultiple && max !== min) {
      temp.textColor = C.hot
    } else if (p.temp === min && hasMultiple && max !== min) {
      temp.textColor = C.cold
    } else {
      temp.textColor = C.text
    }
    temp.lineLimit = 1

    // 偏差
    if (median != null && Math.abs(p.temp - median) >= 0.05) {
      row.addSpacer(3)
      const delta = p.temp - median
      const sign = delta > 0 ? '+' : ''
      const d = row.addText(`${sign}${delta.toFixed(1)}`)
      d.font = Font.mediumSystemFont(10)
      d.textColor = delta > 0 ? C.hot : C.cold
    }
  }
}

// GZQX 预报展开了行
function renderForecast(w, data) {
  const gzqx = data.providers.find(p => p.id === 'gzqx')
  if (!gzqx || !gzqx.forecast) return

  w.addSpacer(4)

  const sep = w.addStack()
  sep.size = new Size(0, 0.5)
  sep.backgroundColor = new Color('#ffffff', 0.06)

  w.addSpacer(4)

  const label = w.addText('番禺区气象台')
  label.font = Font.boldSystemFont(10)
  label.textColor = C.purple
  w.addSpacer(2)

  const txt = w.addText(gzqx.forecast)
  txt.font = Font.regularSystemFont(10)
  txt.textColor = C.text2
  txt.lineLimit = 4
}

// 底部
function renderFooter(w, updatedAt, count) {
  const row = w.addStack()
  row.layoutHorizontally()
  row.addSpacer()
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const label = row.addText(`更新 ${time} · ${count} 信源`)
  label.font = Font.regularSystemFont(9)
  label.textColor = C.dim
  row.addSpacer()
}

// ── 中号 / 大号 主渲染 ──
function renderMain(w, data) {
  setBackground(w)
  w.setPadding(14, 16, 12, 16)

  renderHeader(w, data)
  w.addSpacer(6)
  renderSummary(w, data)

  const hasMultiple = data.count >= 2 && data.max !== data.min

  w.addSpacer(8)

  for (const p of data.providers) {
    renderRow(w, p, data.median, data.max, data.min, hasMultiple)
    w.addSpacer(4)
  }

  renderForecast(w, data)
  w.addSpacer(4)
  renderFooter(w, data.updatedAt, data.count)
}

// ── 小号布局 ──
function renderSmall(w, data) {
  setBackground(w)
  w.setPadding(14, 14, 12, 14)

  const city = w.addText(data.city)
  city.font = Font.boldSystemFont(16)
  city.textColor = C.text
  city.centerAlignText()

  w.addSpacer(4)

  if (data.median != null) {
    const big = w.addText(`${data.median.toFixed(0)}°`)
    big.font = Font.boldSystemFont(42)
    big.textColor = C.text
    big.centerAlignText()
  }

  w.addSpacer(2)

  const info = w.addText(`${data.max}° / ${data.min}°  ${data.count}信源`)
  info.font = Font.mediumSystemFont(11)
  info.textColor = C.text2
  info.centerAlignText()

  w.addSpacer(6)

  // 紧凑温度条
  const bar = w.addStack()
  bar.layoutHorizontally()
  bar.addSpacer()
  const ok = data.providers.filter(p => p.temp != null)
  for (const p of ok) {
    const hex = PROVIDER_COLORS[p.id] || '#6e6e73'
    const dot = bar.addText('●')
    dot.font = Font.regularSystemFont(7)
    dot.textColor = new Color(hex)
    bar.addSpacer(3)
  }
  bar.addSpacer()

  w.addSpacer(4)
  renderFooter(w, data.updatedAt, data.count)
}

// ── 错误 ──
function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const icon = w.addText('⚠')
  icon.font = Font.systemFont(22)
  icon.centerAlignText()
  w.addSpacer(4)
  const title = w.addText('无法加载')
  title.font = Font.semiboldSystemFont(14)
  title.textColor = C.text
  title.centerAlignText()
  w.addSpacer(2)
  const detail = w.addText(msg)
  detail.font = Font.regularSystemFont(10)
  detail.textColor = C.dim
  detail.centerAlignText()
  w.addSpacer()
}

// ── Main ──
async function run() {
  const param = config.runsInWidget ? args.widgetParameter : null
  let city
  if (param) {
    const idx = parseInt(param)
    city = !isNaN(idx) && CONFIG.cities[idx]
      ? CONFIG.cities[idx]
      : CONFIG.cities.find(c => c.name === param || c.cityName === param)
  }
  if (!city) city = CONFIG.cities[CONFIG.defaultCityIdx]

  if (!config.runsInWidget) {
    const preview = new ListWidget()
    preview.addText(`${city.name} · 天气实况对比`)
    preview.addText(CONFIG.apiUrl)
    preview.presentSmall()
  }

  const w = new ListWidget()

  try {
    const data = await fetchData(city.lat, city.lon, city.name, city.cityName)
    if (config.widgetFamily === 'small') {
      renderSmall(w, data)
    } else {
      renderMain(w, data)
    }
  } catch (e) {
    renderError(w, e.message || '未知错误')
  }

  if (config.runsInWidget) {
    Script.setWidget(w)
  } else {
    w.presentMedium()
  }
  Script.complete()
}

await run()
