const KEY = 'source-credibility-v1'
const DEFAULT = 3

export type Scores = Record<string, Record<string, number>>  // cityName → providerId → 0–5

export function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Scores) : {}
  } catch { return {} }
}

export function saveScore(
  all: Scores,
  cityName: string,
  providerId: string,
  score: number,
): Scores {
  const clamped = Math.max(0, Math.min(5, score))
  const next: Scores = {
    ...all,
    [cityName]: { ...(all[cityName] ?? {}), [providerId]: clamped },
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  return next
}

export function getScore(all: Scores, cityName: string, providerId: string): number {
  return all[cityName]?.[providerId] ?? DEFAULT
}
