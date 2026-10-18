import test from 'node:test'
import assert from 'node:assert/strict'
import { addSelectedToShoppingList, pruneSelection, toggleSelection } from '../src/utils/inventorySelection.js'

// specs/013：「我的用品」長按多選的純邏輯。
const items = [
  { id: 'a', name: '洗衣精', inShoppingList: false },
  { id: 'b', name: '洗碗精', inShoppingList: true },
  { id: 'c', name: '海綿', inShoppingList: false },
  { id: 'd', name: '垃圾袋', inShoppingList: false },
]

// 與 stores/items.js 相同的介面：snapshotItem、addManyToShoppingList、restoreItem。
function fakeStore() {
  const state = new Map(items.map((item) => [item.id, { ...item }]))
  const calls = []
  return {
    state,
    calls,
    snapshotItem(id) { calls.push(['snapshot', id]); return state.has(id) ? structuredClone(state.get(id)) : null },
    addManyToShoppingList(ids) { calls.push(['add', [...ids]]); for (const id of ids) state.get(id).inShoppingList = true },
    restoreItem(snapshot) { calls.push(['restore', snapshot.id]); Object.assign(state.get(snapshot.id), snapshot) },
  }
}

test('toggleSelection 加選與取消選取', () => {
  assert.deepEqual(toggleSelection(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(toggleSelection(['a'], 'a'), [])
})

test('pruneSelection：不在目前結果內的已選項目取消選取（FR-1302）', () => {
  assert.deepEqual(pruneSelection(['a', 'b', 'c'], [items[0], items[2]]), ['a', 'c'])
  assert.deepEqual(pruneSelection(['b'], [items[0]]), [])
})

test('pruneSelection：沒有變動時回傳原陣列，避免多餘的重新渲染', () => {
  const selected = ['a']
  assert.equal(pruneSelection(selected, items), selected)
})

test('加入時略過已在清單的用品，N 為實際新加入的數量（FR-1304）', () => {
  const store = fakeStore()
  const { addedCount, restore } = addSelectedToShoppingList(store, ['a', 'b', 'c'], items)
  assert.equal(addedCount, 2)
  assert.ok(restore)
  assert.deepEqual(store.calls.find(([name]) => name === 'add'), ['add', ['a', 'c']])
  assert.equal(store.state.get('a').inShoppingList, true)
  assert.equal(store.state.get('c').inShoppingList, true)
  assert.equal(store.state.get('d').inShoppingList, false)
})

test('復原只還原這一批新加入的用品，略過的不動（FR-1305）', () => {
  const store = fakeStore()
  const { restore } = addSelectedToShoppingList(store, ['a', 'b', 'c'], items)
  restore()
  assert.equal(store.state.get('a').inShoppingList, false)
  assert.equal(store.state.get('c').inShoppingList, false)
  assert.equal(store.state.get('b').inShoppingList, true) // 本來就在清單，不被動到
  assert.deepEqual(store.calls.filter(([name]) => name === 'restore').map(([, id]) => id), ['a', 'c'])
})

test('快照在加入之前全部存好（同一個同步流程）', () => {
  const store = fakeStore()
  addSelectedToShoppingList(store, ['a', 'c'], items)
  const names = store.calls.map(([name]) => name)
  assert.deepEqual(names, ['snapshot', 'snapshot', 'add'])
})

test('全部已在清單：不改資料、沒有復原（FR-1304）', () => {
  const store = fakeStore()
  const result = addSelectedToShoppingList(store, ['b'], items)
  assert.deepEqual(result, { addedCount: 0, restore: null })
  assert.deepEqual(store.calls, [])
})

test('沒有選取時什麼都不做', () => {
  const store = fakeStore()
  assert.deepEqual(addSelectedToShoppingList(store, [], items), { addedCount: 0, restore: null })
})

test('只處理傳入清單內的用品（不在目前結果內的不加入）', () => {
  const store = fakeStore()
  const { addedCount } = addSelectedToShoppingList(store, ['a', 'd'], [items[0]])
  assert.equal(addedCount, 1)
  assert.equal(store.state.get('d').inShoppingList, false)
})
