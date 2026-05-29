// WeatherWidget.js — 多信源天气实况对比
// ===============================================

const CONFIG = {
  apiUrl: 'https://weather-8za.pages.dev/api/widget',
  cities: [
    { name: '番禺', lat: 22.9468, lon: 113.3622, cityName: '番禺' },
    { name: '安福', lat: 27.3954, lon: 114.6195, cityName: '安福' },
  ],
  defaultCityIdx: 0,
}

const SHORT = {
  'nmc': '中央气象台', 'gzqx': '番禺气象台', 'qweather': '和风天气',
  'caiyun': '彩云天气', 'owm': 'OWM', 'open-meteo': 'Open-Meteo',
}

const PC = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'qweather': '#3b82f6',
  'caiyun': '#f59e0b', 'owm': '#f97316', 'open-meteo': '#22c55e',
}

const C = {
  text:  new Color('#f5f5f7'),
  text2: new Color('#98989d'),
  dim:   new Color('#6e6e73'),
  hot:   new Color('#ff453a'),
  cold:  new Color('#40c8e0'),
}

// ── 数据 ──
let _k = '', _d = null
async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _k && _d) return _d
  const p = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const req = new Request(`${CONFIG.apiUrl}?${p}`)
  req.timeoutInterval = 15
  _d = await req.loadJSON()
  _k = key
  return _d
}

// ── 背景 ──
function bg(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#050810'), new Color('#0c1526'), new Color('#080e18')]
  g.locations = [0, 0.5, 1]
  w.backgroundGradient = g
}

// ── 中号 / 大号 ──
function renderMain(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const multi = data.count >= 2 && data.max !== data.min

  // ═══ 左右分割 ═══
  const root = w.addStack()
  root.layoutHorizontally()
  root.spacing = 14

  // ── 左面板：地名 + 温度 + 天气 ──
  const left = root.addStack()
  left.layoutVertically()
  left.size = new Size(90, 0)

  // 顶部：地名
  const city = left.addText(data.city)
  city.font = Font.mediumSystemFont(14)
  city.textColor = C.text
  city.lineLimit = 1

  left.addSpacer()

  // 中间：大号温度
  const median = data.median != null ? Math.round(data.median) : '—'
  const big = left.addText(`${median}°`)
  big.font = Font.boldSystemFont(52)
  big.textColor = C.text
  big.lineLimit = 1
  big.leftAlignText()

  left.addSpacer()

  // 底部：天气（与地名上下对称）
  if (data.text) {
    const wx = left.addText(data.text)
    wx.font = Font.mediumSystemFont(14)
    wx.textColor = C.text2
    wx.lineLimit = 1
  } else {
    left.addText(' ')
  }

  // ── 右面板：信源汇总条 ──
  const right = root.addStack()
  right.layoutVertically()
  right.spacing = 5

  // 标题
  const title = right.addText(`${data.count} 个信源`)
  title.font = Font.regularSystemFont(10)
  title.textColor = C.dim
  right.addSpacer(2)

  for (const p of data.providers) {
    const row = right.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    // 圆点
    const hex = PC[p.id] || '#6e6e73'
    const d = row.addText('●')
    d.font = Font.regularSystemFont(6)
    d.textColor = new Color(hex)

    row.addSpacer(4)

    // 名称
    const nm = row.addText(SHORT[p.id] || p.name)
    nm.font = Font.regularSystemFont(11)
    nm.textColor = p.error ? C.dim : C.text
    nm.lineLimit = 1

    row.addSpacer()

    // 温度
    if (p.error) {
      const er = row.addText('—')
      er.font = Font.regularSystemFont(12)
      er.textColor = C.dim
    } else {
      const t = Math.round(p.temp)
      const tp = row.addText(`${t}°`)
      tp.font = Font.semiboldSystemFont(13)
      if (multi && p.temp === data.max) tp.textColor = C.hot
      else if (multi && p.temp === data.min) tp.textColor = C.cold
      else tp.textColor = C.text
      tp.lineLimit = 1
    }
  }

  // ── 底部：番禺气象台预报 ──
  w.addSpacer(6)
  const gzqx = data.providers.find(p => p.id === 'gzqx')
  if (gzqx && gzqx.forecast) {
    const div = w.addStack()
    div.size = new Size(0, 0.5)
    div.backgroundColor = new Color('#ffffff', 0.06)
    w.addSpacer(4)
    const fc = w.addText(gzqx.forecast)
    fc.font = Font.regularSystemFont(9)
    fc.textColor = C.dim
    fc.lineLimit = 2
    w.addSpacer(2)
  }

  // 底部：更新时间
  const ft = w.addStack()
  ft.layoutHorizontally()
  ft.addSpacer()
  const time = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const f = ft.addText(`更新 ${time}`)
  f.font = Font.regularSystemFont(8)
  f.textColor = C.dim
  ft.addSpacer()
}

// ── 小号 ──
function renderSmall(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(13)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.median != null) {
    const t = w.addText(`${Math.round(data.median)}°`)
    t.font = Font.boldSystemFont(42)
    t.textColor = C.text
    t.centerAlignText()
  }

  w.addSpacer(4)

  if (data.text) {
    const wx = w.addText(data.text)
    wx.font = Font.mediumSystemFont(10)
    wx.textColor = C.text2
    wx.centerAlignText()
  }

  w.addSpacer(8)

  const dots = w.addStack()
  dots.layoutHorizontally()
  dots.addSpacer()
  for (const p of data.providers) {
    if (p.temp == null) continue
    const d = dots.addText('●')
    d.font = Font.regularSystemFont(7)
    d.textColor = new Color(PC[p.id] || '#6e6e73')
    dots.addSpacer(3)
  }
  dots.addSpacer()

  w.addSpacer(6)

  const ft = w.addText(`${data.count}信源  ·  ${data.max}° / ${data.min}°`)
  ft.font = Font.regularSystemFont(8)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ── 错误 ──
function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const ic = w.addText('⚠')
  ic.font = Font.systemFont(20)
  ic.centerAlignText()
  w.addSpacer(4)
  w.addText('无法加载')
  w.addSpacer(2)
  const d = w.addText(msg)
  d.font = Font.regularSystemFont(10)
  d.textColor = C.dim
  d.centerAlignText()
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
    const pv = new ListWidget()
    pv.addText(`${city.name} · 天气实况对比`)
    pv.addText(CONFIG.apiUrl)
    pv.presentSmall()
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
