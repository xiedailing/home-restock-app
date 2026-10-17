import test from 'node:test'
import assert from 'node:assert/strict'
import { STATUS, getStatusMarks } from '../src/models/item.js'

// specs/010 FR-1001：列表與詳情共用的狀態標記規則。
const cases = [
  // [提醒狀態, 已在清單, 預期 pill, 預期清單標記]
  [STATUS.OVERDUE, true, STATUS.OVERDUE, true],
  [STATUS.OVERDUE, false, STATUS.OVERDUE, false],
  [STATUS.DUE_SOON, true, STATUS.DUE_SOON, true],
  [STATUS.DUE_SOON, false, STATUS.DUE_SOON, false],
  [STATUS.NOT_NEEDED, true, STATUS.IN_SHOPPING_LIST, false],
  [STATUS.NOT_NEEDED, false, null, false],
  [STATUS.REMINDER_OFF, true, STATUS.IN_SHOPPING_LIST, false],
  [STATUS.REMINDER_OFF, false, null, false],
]

for (const [reminder, inList, pill, showListMark] of cases) {
  test(`getStatusMarks(${reminder}, 已在清單=${inList})`, () => {
    assert.deepEqual(getStatusMarks(reminder, inList), { pill, showListMark })
  })
}

test('未知的提醒狀態當作沒有提醒：只看是否已在清單', () => {
  assert.deepEqual(getStatusMarks('unknown', true), { pill: STATUS.IN_SHOPPING_LIST, showListMark: false })
  assert.deepEqual(getStatusMarks(undefined, false), { pill: null, showListMark: false })
})

test('inShoppingList 為 undefined 視為不在清單', () => {
  assert.deepEqual(getStatusMarks(STATUS.OVERDUE, undefined), { pill: STATUS.OVERDUE, showListMark: false })
})
