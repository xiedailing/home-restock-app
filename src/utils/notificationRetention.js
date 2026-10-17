// 六個曆月；月底日期以目標月份最後一天為上限，保留相同本地時間。
export function notificationCutoff(now = Date.now()) {
  const cutoff = new Date(now)
  const day = cutoff.getDate()
  cutoff.setDate(1)
  cutoff.setMonth(cutoff.getMonth() - 6)
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate()
  cutoff.setDate(Math.min(day, lastDay))
  return cutoff.getTime()
}
