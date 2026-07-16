// 华为云 FunctionGraph：番禺气象台数据抓取（国内节点兜底）。
//
// 部署要求：
//   运行时：Node.js 18
//   触发器：APIG（API 网关）HTTP 触发器，方法 GET，开放认证
//   环境变量：AUTH_TOKEN — 自定义鉴权 token（Cloudflare 侧调用时在 X-Auth-Token 头携带）
//
// 本函数与 functions/_lib/gz.ts 逻辑完全一致，
// 仅用于 Cloudflare 节点直连 tqyb.com.cn 被 503 封锁时的降级路径。

'use strict'

const ORIGIN = 'http://www.tqyb.com.cn'
const OBT_AREA_REP_URL = `${ORIGIN}/data/obtAreaRep/gz_obtAreaRep.js`
const PY_FORECAST_URL  = `${ORIGIN}/data/shorttime/GDPY_shorttime.js`
const ALARM_URL        = `${ORIGIN}/data/alarm/panyu/panyu_areaAlarm.js`

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Referer': `${ORIGIN}/gzpanyu/`,
  'X-Requested-With': 'XMLHttpRequest',
}

exports.handler = async (event, _context) => {
  const respHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  }

  // 鉴权：AUTH_TOKEN 环境变量不为空时校验 X-Auth-Token 请求头
  const expectedToken = process.env.AUTH_TOKEN
  if (expectedToken) {
    const headers = event.headers || {}
    const incoming = headers['x-auth-token'] || headers['X-Auth-Token'] || ''
    if (incoming !== expectedToken) {
      return { statusCode: 401, headers: respHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
    }
  }

  try {
    const data = await scrapeGuangzhou()
    return { statusCode: 200, headers: respHeaders, body: JSON.stringify(data) }
  } catch (e) {
    return {
      statusCode: 502,
      headers: respHeaders,
      body: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
    }
  }
}

// ── 抓取入口 ─────────────────────────────────────────────

async function scrapeGuangzhou() {
  const [rtRes, fcRes, alarmRes] = await Promise.allSettled([
    fetchData(OBT_AREA_REP_URL, 'gz_obtAreaRep'),
    fetchData(PY_FORECAST_URL,  'GDPY_shorttime'),
    fetchArray(ALARM_URL,       'panyu_areaAlarm'),
  ])

  if (rtRes.status === 'rejected') throw rtRes.reason
  const out = mapAreaData(rtRes.value)

  if (fcRes.status === 'fulfilled') {
    const fc = fcRes.value
    const content = typeof fc?.content === 'string' ? fc.content.trim() : undefined
    const issued  = typeof fc?.ddatetime === 'string' ? fc.ddatetime : undefined
    if (content && isForecastCurrent(content, issued)) {
      out.forecast = content
      out.forecastIssuedAt = issued
    }
  }

  if (alarmRes.status === 'fulfilled') {
    const warnings = parseAlarms(alarmRes.value)
    if (warnings.length) out.warnings = warnings
  }

  return out
}

// ── 解析 ──────────────────────────────────────────────────

function mapAreaData(d) {
  const gdpy = d?.GDPY
  if (!gdpy) throw new Error(`数据缺少 GDPY 字段，顶层字段: [${d ? Object.keys(d).join(', ') : d}]`)

  const z = parseFloat(gdpy.z)
  if (isNaN(z) || z <= 0) throw new Error(`GDPY.z 无效: ${gdpy.z}`)

  const mean = (key) => {
    const n = parseFloat(gdpy[key])
    if (isNaN(n) || n <= -999 * z) return undefined
    return n / z / 10
  }

  const temp = mean('t')
  if (temp == null) throw new Error('未解析到温度 GDPY.t')
  // 合理性护栏：番禺（亚热带）实况温度超出 [-10, 45]℃ 视为上游异常
  // （区域均值由 925 站累加求平均，单个自动站故障即可拉偏）。宁可让本信源
  // 显示暂无数据，也不返回错得离谱的温度。
  if (temp < -10 || temp > 45)
    throw new Error('温度超出合理范围（' + temp + '℃），疑似上游站点异常')

  const speedMs = mean('wdidf')
  const deg     = mean('wdidd')

  // 二级字段各自范围校验：越界则丢弃（不影响主信源可用性）
  const rhRaw = mean('rh')
  const humidity = rhRaw != null && rhRaw >= 0 && rhRaw <= 100 ? rhRaw : undefined
  const pRaw = mean('p')
  const pressure = pRaw != null && pRaw >= 900 && pRaw <= 1080 ? pRaw : undefined
  const rainRaw = mean('hourrf')
  const rain1h = rainRaw != null && rainRaw >= 0 && rainRaw <= 500 ? rainRaw : undefined
  const windSpeed = speedMs != null && speedMs >= 0 && speedMs <= 100
    ? Math.round(speedMs * 3.6 * 10) / 10
    : undefined

  let observedAt
  const ts = typeof gdpy.ddatetime === 'string' ? gdpy.ddatetime : undefined
  if (ts) {
    const dtStr  = ts.replace(' ', 'T')
    const withSec = /T\d{2}:\d{2}$/.test(dtStr) ? dtStr + ':00' : dtStr
    observedAt = withSec + '.000Z'
  }

  return {
    temp,
    humidity,
    windSpeed,
    windDir:   deg != null ? degToDir(deg) : undefined,
    pressure,
    rain1h,
    text:      undefined,
    observedAt,
  }
}

function parseAlarms(items) {
  if (!Array.isArray(items)) return []
  const warnings = []
  const seen = new Set()
  for (const item of items) {
    const serial = typeof item?.serial === 'string' ? item.serial.trim() : ''
    if (serial.length < 3) continue
    const level = serial.slice(-2)
    const type  = serial.slice(0, -2)
    if (!type) continue
    const key = type + level
    if (seen.has(key)) continue
    seen.add(key)
    warnings.push({ title: `${type}${level}预警信号`, type, level })
  }
  return warnings
}

function isForecastCurrent(content, issued) {
  if (!issued) return true
  const m = issued.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
  if (!m) return true
  const [, Y, Mo, D, H, Mi] = m.map(Number)
  const issuedUTC = Date.UTC(Y, Mo - 1, D, H - 8, Mi)
  const now = Date.now()
  if (now < issuedUTC - 3_600_000) return true

  let limitUTC
  const em = content?.match(/到\s*(\d{1,2})\s*时/)
  if (em) {
    const eh = +em[1]
    limitUTC = Date.UTC(Y, Mo - 1, D + (eh <= H ? 1 : 0), eh - 8, 0)
  } else {
    limitUTC = issuedUTC + 4 * 3_600_000
  }
  return now <= limitUTC + 30 * 60_000
}

// ── 网络 ──────────────────────────────────────────────────

async function fetchData(url, varName) {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 60_000)}`, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return extractObject(await res.text(), varName)
}

async function fetchArray(url, varName) {
  const res = await fetch(`${url}?t=${Math.floor(Date.now() / 60_000)}`, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return extractArray(await res.text(), varName)
}

// ── 括号配对提取 ──────────────────────────────────────────

function extractObject(text, varName) {
  return extractBracketed(text, varName, '{', '}')
}

function extractArray(text, varName) {
  return extractBracketed(text, varName, '[', ']')
}

function extractBracketed(text, varName, open, close) {
  const anchor = text.indexOf(varName)
  const from   = text.indexOf(open, anchor >= 0 ? anchor : 0)
  if (from === -1) throw new Error(`未找到起始 ${open}`)

  let depth = 0, inStr = false, strCh = ''
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (ch === strCh && text[i - 1] !== '\\') inStr = false
      continue
    }
    if (ch === '"' || ch === "'") { inStr = true; strCh = ch }
    else if (ch === open)  { depth++ }
    else if (ch === close) {
      if (--depth === 0) {
        try { return JSON.parse(text.slice(from, i + 1)) }
        catch (e) { throw new Error(`解析失败：${e.message}`) }
      }
    }
  }
  throw new Error('括号不配对')
}

// ── 工具 ──────────────────────────────────────────────────

function degToDir(deg) {
  return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(deg / 45) % 8] + '风'
}
