// WeatherWidget.js — 多信源天气实况对比
// ===============================================
// 使用：
// 1. Scriptable App 中新建脚本，粘贴全部内容
// 2. 添加到桌面（中号推荐，小号/大号也适配）
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

const SHORT = {
  'nmc': '中央气象台', 'gzqx': '番禺气象台', 'qweather': '和风天气',
  'caiyun': '彩云天气', 'owm': 'OWM', 'open-meteo': 'Open-Meteo',
}

const PC = {
  'nmc': '#ef4444', 'gzqx': '#a855f7', 'qweather': '#3b82f6',
  'caiyun': '#f59e0b', 'owm': '#f97316', 'open-meteo': '#22c55e',
}

const C = {
  text:   new Color('#f5f5f7'),
  text2:  new Color('#98989d'),
  dim:    new Color('#6e6e73'),
  hot:    new Color('#ff453a'),
  cold:   new Color('#40c8e0'),
  warn:   new Color('#ffd60a'),
}

// ── 数据 ──
let _k = '', _d = null
async function fetchData(lat, lon, name, cityName) {
  const key = `${lat},${lon},${name}`
  if (key === _k && _d) return _d
  const p = `lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}&cityName=${encodeURIComponent(cityName)}`
  const r = new Request(`${CONFIG.apiUrl}?${p}`)
  r.timeoutInterval = 15
  const res = await r.loadJSON()
  _k = key; _d = res; return res
}

// ── 背景 ──
function bg(w) {
  const g = new LinearGradient()
  g.colors = [new Color('#050810'), new Color('#0c1526'), new Color('#080e18')]
  g.locations = [0, 0.5, 1]
  w.backgroundGradient = g
}

// ── 辅助 ──
function dot(color) {
  return { text: '●', color: new Color(color), size: 7 }
}

// ══════════════════════════════════════
// 中号 / 大号
// ══════════════════════════════════════

function renderMain(w, data) {
  bg(w)
  w.setPadding(16, 18, 14, 18)
  const ok = data.providers.filter(p => p.temp != null)
  const multi = data.count >= 2 && data.max !== data.min

  // ── 头部：城市 + 天气 + 信源数 ──
  const hdr = w.addStack()
  hdr.layoutHorizontally()
  hdr.centerAlignContent()
  const city = hdr.addText(data.city)
  city.font = Font.semiboldSystemFont(17)
  city.textColor = C.text
  hdr.addSpacer(6)
  if (data.text) {
    const tx = hdr.addText(data.text)
    tx.font = Font.mediumSystemFont(14)
    tx.textColor = C.text2
  }
  hdr.addSpacer()
  const n = hdr.addText(`${data.count}信源`)
  n.font = Font.regularSystemFont(11)
  n.textColor = C.dim

  w.addSpacer(12)

  // ── 主体：左侧中位温度 + 右侧温度条 ──
  const body = w.addStack()
  body.layoutHorizontally()
  body.bottomAlignContent()

  // 左侧 —— 中位温度
  const left = body.addStack()
  left.layoutVertically()

  if (data.median != null) {
    const big = left.addText(`${data.median.toFixed(0)}`)
    big.font = Font.boldSystemFont(58)
    big.textColor = C.text
    big.lineLimit = 1
  }

  left.addSpacer(2)

  // 温度范围
  const range = left.addStack()
  range.layoutHorizontally()
  range.spacing = 4
  if (data.max != null) {
    const hi = range.addText(`${data.max}°`)
    hi.font = Font.semiboldSystemFont(11)
    hi.textColor = C.hot
  }
  const sep = range.addText('/')
  sep.font = Font.regularSystemFont(11)
  sep.textColor = C.dim
  if (data.min != null) {
    const lo = range.addText(`${data.min}°`)
    lo.font = Font.semiboldSystemFont(11)
    lo.textColor = C.cold
  }

  body.addSpacer(20)

  // 右侧 —— 信源列表
  const right = body.addStack()
  right.layoutVertically()
  right.spacing = 5

  for (const p of data.providers) {
    const row = right.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    // 彩色圆点
    const hex = PC[p.id] || '#6e6e73'
    const d = row.addText('●')
    d.font = Font.regularSystemFont(7)
    d.textColor = new Color(hex)

    row.addSpacer(4)

    // 名称
    const lb = row.addText(SHORT[p.id] || p.name)
    lb.font = Font.mediumSystemFont(11)
    lb.textColor = p.error ? C.dim : C.text
    lb.lineLimit = 1

    row.addSpacer(6)

    // 温度
    if (p.error) {
      const er = row.addText('—')
      er.font = Font.regularSystemFont(12)
      er.textColor = C.dim
    } else {
      const tp = row.addText(`${p.temp}°`)
      tp.font = Font.semiboldSystemFont(13)
      if (p.temp === data.max && multi) tp.textColor = C.hot
      else if (p.temp === data.min && multi) tp.textColor = C.cold
      else tp.textColor = C.text
      tp.lineLimit = 1

      // 偏差
      if (data.median != null && Math.abs(p.temp - data.median) >= 0.05) {
        row.addSpacer(2)
        const delta = p.temp - data.median
        const sign = delta > 0 ? '+' : ''
        const dl = row.addText(`${sign}${delta.toFixed(1)}`)
        dl.font = Font.mediumSystemFont(9)
        dl.textColor = delta > 0 ? C.hot : C.cold
      }
    }
  }

  w.addSpacer(10)

  // ── 番禺气象台预报 ──
  const gzqx = data.providers.find(p => p.id === 'gzqx')
  if (gzqx && gzqx.forecast) {
    const div = w.addStack()
    div.size = new Size(0, 0.5)
    div.backgroundColor = new Color('#ffffff', 0.06)
    w.addSpacer(6)

    const fc = w.addText(gzqx.forecast)
    fc.font = Font.regularSystemFont(10)
    fc.textColor = C.text2
    fc.lineLimit = 2
  }

  w.addSpacer(6)

  // ── 底部 ──
  const ft = w.addStack()
  ft.layoutHorizontally()
  ft.addSpacer()
  const time = data.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const f = ft.addText(`更新 ${time}`)
  f.font = Font.regularSystemFont(9)
  f.textColor = C.dim
  ft.addSpacer()
}

// ══════════════════════════════════════
// 小号
// ══════════════════════════════════════

function renderSmall(w, data) {
  bg(w)
  w.setPadding(14, 16, 12, 16)

  const city = w.addText(data.city)
  city.font = Font.semiboldSystemFont(14)
  city.textColor = C.text2
  city.centerAlignText()

  w.addSpacer(6)

  if (data.median != null) {
    const t = w.addText(`${data.median.toFixed(0)}°`)
    t.font = Font.boldSystemFont(44)
    t.textColor = C.text
    t.centerAlignText()
  }

  w.addSpacer(4)

  const info = w.addText(`${data.max}° / ${data.min}°  ${data.text || ''}`)
  info.font = Font.mediumSystemFont(10)
  info.textColor = C.text2
  info.centerAlignText()

  w.addSpacer(8)

  // 彩色圆点行
  const dots = w.addStack()
  dots.layoutHorizontally()
  dots.addSpacer()
  for (const p of data.providers) {
    if (p.temp == null) continue
    const hex = PC[p.id] || '#6e6e73'
    const d = dots.addText('●')
    d.font = Font.regularSystemFont(8)
    d.textColor = new Color(hex)
    dots.addSpacer(4)
  }
  dots.addSpacer()

  w.addSpacer(6)

  const ft = w.addText(`${data.count}信源`)
  ft.font = Font.regularSystemFont(8)
  ft.textColor = C.dim
  ft.centerAlignText()
}

// ══════════════════════════════════════
// 错误
// ══════════════════════════════════════

function renderError(w, msg) {
  w.backgroundColor = new Color('#0a0d16')
  w.addSpacer()
  const ic = w.addText('⚠')
  ic.font = Font.systemFont(20)
  ic.centerAlignText()
  w.addSpacer(4)
  const t = w.addText('无法加载')
  t.font = Font.semiboldSystemFont(13)
  t.textColor = C.text
  t.centerAlignText()
  w.addSpacer(2)
  const d = w.addText(msg)
  d.font = Font.regularSystemFont(10)
  d.textColor = C.dim
  d.centerAlignText()
  w.addSpacer()
}

// ══════════════════════════════════════
// Main
// ══════════════════════════════════════

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
