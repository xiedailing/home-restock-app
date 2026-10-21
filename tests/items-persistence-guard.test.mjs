import test from 'node:test'
import assert from 'node:assert/strict'
import { createItemsPersistenceGuard, ITEMS_WRITE_LOCK } from '../src/utils/itemsPersistenceGuard.js'

const key = 'home-restock:v1:items'
function fixture() {
  const originals = ['localStorage', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  const memory = new Map([[key, JSON.stringify({ version: 2, data: { items: [], spaces: [] } })]])
  const install = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true })
  install('localStorage', { getItem: name => memory.get(name) ?? null, setItem: (name, value) => memory.set(name, value), removeItem: name => memory.delete(name) })
  install('navigator', {})
  return { memory, install, restore() { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } } }
}
test('item revisions reject stale snapshots, including an older tab delayed save', async () => {
  const f = fixture()
  try {
    let conflict = ''
    const a = createItemsPersistenceGuard(message => { conflict = message }), b = createItemsPersistenceGuard()
    assert.equal(b.write({ items: [{ id: 'new' }], spaces: [] }), true)
    const after = f.memory.get(key)
    assert.ok(JSON.parse(after).revision)
    assert.throws(() => a.write({ items: [], spaces: [] }), { code: 'STALE_ITEMS' })
    await assert.rejects(a.withLock(() => a.write({ items: [], spaces: [] })), { code: 'STALE_ITEMS' })
    assert.equal(f.memory.get(key), after); assert.match(conflict, /重新載入/)
  } finally { f.restore() }
})
test('cooperating async item writers serialize under the same Web Lock and compare after acquiring it', async () => {
  const f = fixture()
  try {
    let tail = Promise.resolve(), release, entered = false
    f.install('navigator', { locks: { request(name, callback) {
      assert.equal(name, ITEMS_WRITE_LOCK)
      const work = tail.then(() => callback({ name }))
      tail = work.catch(() => {})
      return work
    } } })
    const a = createItemsPersistenceGuard(), b = createItemsPersistenceGuard()
    const wait = new Promise(resolve => { release = resolve })
    const first = b.withLock(async () => { await wait; b.write({ items: [{ id: 'b' }], spaces: [] }) })
    const second = a.withLock(() => { entered = true; a.write({ items: [{ id: 'a' }], spaces: [] }) })
    release(); await first
    await assert.rejects(second, { code: 'STALE_ITEMS' })
    assert.equal(entered, false)
    assert.equal(JSON.parse(f.memory.get(key)).data.items[0].id, 'b')
  } finally { f.restore() }
})
test('storage failure leaves envelope and baseline intact, while catalog adoption requires the exact own transaction data', () => {
  const f = fixture()
  try {
    const guard = createItemsPersistenceGuard(), before = f.memory.get(key)
    f.install('localStorage', { getItem: name => f.memory.get(name) ?? null, setItem() { throw new Error('quota') } })
    assert.equal(guard.write({ items: [{ id: 'x' }], spaces: [] }), false)
    assert.equal(f.memory.get(key), before)
    f.install('localStorage', { getItem: name => f.memory.get(name) ?? null, setItem: (name, value) => f.memory.set(name, value) })
    const own = { items: [{ id: 'catalog' }], spaces: [] }
    f.memory.set(key, JSON.stringify({ version: 2, data: own }))
    guard.didCommitCatalog(own)
    assert.equal(guard.write(own), true)
    f.memory.set(key, JSON.stringify({ version: 2, data: { items: [{ id: 'foreign' }], spaces: [] } }))
    guard.didCommitCatalog(own)
    assert.throws(() => guard.write(own), { code: 'STALE_ITEMS' })
  } finally { f.restore() }
})
