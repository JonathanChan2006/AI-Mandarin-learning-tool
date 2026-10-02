const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Short interval label for grade buttons: `<1m`, `10m`, `3h`, `15d`. */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1m'
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(ms / HOUR)
  if (hours < 24) return `${hours}h`
  return `${Math.round(ms / DAY)}d`
}

/** Local date and time for log views. */
export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
