import { useState } from 'react'
import { getKey, setKey, type KeyId } from '../providers/keys'

interface KeyField {
  id: KeyId
  label: string
  desc: string
}

const FIELDS: KeyField[] = [
  { id: 'qweather', label: '和风天气 Key', desc: '在 dev.qweather.com 注册免费开发版后获取' },
  { id: 'caiyun', label: '彩云天气 Token', desc: '在 platform.caiyunapp.com 申请' },
  { id: 'twc', label: 'The Weather Channel apiKey', desc: 'weather.com（The Weather Company）v3 接口的 apiKey' },
]

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const f of FIELDS) o[f.id] = getKey(f.id) ?? ''
    return o
  })

  const save = () => {
    for (const f of FIELDS) setKey(f.id, vals[f.id] ?? '')
    onClose()
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>信源密钥设置</h2>
        <p className="hint" style={{ padding: '0 0 8px', textAlign: 'left' }}>
          密钥仅保存在本机浏览器（localStorage），不会上传。Open-Meteo、中央气象台、广州市气象局无需密钥。
        </p>
        {FIELDS.map((f) => (
          <div className="key-row" key={f.id}>
            <label>{f.label}</label>
            <input
              className="field"
              type="password"
              placeholder="留空则不启用该信源"
              value={vals[f.id]}
              onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}
            />
            <div className="desc">{f.desc}</div>
          </div>
        ))}
        <button className="btn-primary" onClick={save}>保存</button>
      </div>
    </div>
  )
}
