// 純資料轉換：既有未知歷史以當下單位補值，不推測過去的換單位事件。
import { generateId } from './id.js'
export function migrateUnitPeriods(item) {
  const period = typeof item.unitPeriodId === 'string' && item.unitPeriodId ? item.unitPeriodId : `legacy:${item.id}`
  return { ...item, unitPeriodId: period, restockRecords: (item.restockRecords ?? []).map(record => ({
    ...record,
    unit: typeof record.unit === 'string' && record.unit ? record.unit : item.unit,
    unitPeriodId: typeof record.unitPeriodId === 'string' && record.unitPeriodId ? record.unitPeriodId : period,
  })) }
}
export function currentUnitRecords(item) {
  const normalized = migrateUnitPeriods(item)
  return normalized.restockRecords.filter(record => record.unitPeriodId === normalized.unitPeriodId
    && record.unit === normalized.unit && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
    && !Number.isNaN(Date.parse(`${record.date}T00:00:00Z`))
    && new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) === record.date
    && Number.isFinite(record.quantity) && record.quantity > 0)
}
export function startUnitPeriod(item, unit) {
  const normalized = migrateUnitPeriods(item)
  if (normalized.unit === unit) return normalized
  return { ...normalized, unit, unitPeriodId: generateId(), snoozedUntil: null }
}
// 只撤銷 snapshot→after 的改動；保留後續新週期、其他補貨與欄位修改。
export function undoItemChange(current, before, after) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const next = { ...current }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (['restockRecords', 'lastRestockDate', 'updatedAt'].includes(key)) continue
    if (!same(before[key], after[key]) && same(current[key], after[key])) { if (Object.hasOwn(before, key)) next[key] = before[key]; else delete next[key] }
  }
  const old = new Map(before.restockRecords.map(record => [record.id, record]))
  const applied = new Map(after.restockRecords.map(record => [record.id, record]))
  const records = [...current.restockRecords]
  for (const [id, record] of applied) {
    const index = records.findIndex(entry => entry.id === id)
    if (index < 0 || !same(records[index], record) || same(old.get(id), record)) continue
    if (old.has(id)) records[index] = old.get(id)
    else records.splice(index, 1)
  }
  for (const [id, record] of old) {
    if (applied.has(id) || records.some(entry => entry.id === id)) continue
    const index = before.restockRecords.findIndex(entry => entry.id === id)
    const following = before.restockRecords.slice(index + 1).find(entry => records.some(current => current.id === entry.id))
    records.splice(following ? records.findIndex(entry => entry.id === following.id) : records.length, 0, record)
  }
  return { ...next, restockRecords: records }
}
