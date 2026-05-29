import { useState } from 'react'
import type { GeoLocation } from '../providers/types'

interface Props {
  onSearch: (q: string) => Promise<GeoLocation[]>
  onPick: (l: GeoLocation) => void
  onLocate: () => void
  onClose: () => void
}

export function SearchSheet({ onSearch, onPick, onLocate, onClose }: Props) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<GeoLocation[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async (value: string) => {
    setQ(value)
    setErr(null)
    if (value.trim().length < 1) { setItems([]); return }
    setBusy(true)
    try {
      setItems(await onSearch(value))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>搜索城市</h2>
        <input
          className="field"
          autoFocus
          placeholder="输入城市名，如 广州 / 北京 / Shanghai"
          value={q}
          onChange={(e) => run(e.target.value)}
        />
        <button className="btn-primary" style={{ background: '#1b2640' }} onClick={onLocate}>
          📍 使用我的当前位置
        </button>
        {busy && <div className="hint">搜索中…</div>}
        {err && <div className="hint" style={{ color: '#f87171' }}>{err}</div>}
        <div>
          {items.map((it, i) => (
            <div key={i} className="result-item" onClick={() => onPick(it)}>
              <span>{it.name}</span>
              <span className="sub">{it.lat.toFixed(2)}, {it.lon.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
