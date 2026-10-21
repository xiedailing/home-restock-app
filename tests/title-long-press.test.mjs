import test from 'node:test'
import assert from 'node:assert/strict'
import { createTitleLongPress } from '../src/utils/titleLongPress.js'
function fixture(enabled = true) {
  let time = 0, holds = 0, cancelled = 0, timer
  const gesture = createTitleLongPress(() => holds++, { enabled: () => enabled, now: () => time,
    schedule: callback => { timer = callback; return 1 }, unschedule: () => { timer = null; cancelled++ } })
  const event = (extra = {}) => ({ button: 0, isPrimary: true, pointerId: 1, clientX: 20, clientY: 20, preventDefault() {}, stopImmediatePropagation() {}, ...extra })
  return { gesture, event, tick: value => { time += value }, holds: () => holds, timer: () => timer, cancelled: () => cancelled }
}
test('three seconds on release toggles once per full hold, not while still down', () => {
  const f = fixture()
  for (let i = 1; i <= 3; i++) {
    f.gesture.pointerdown(f.event()); f.tick(3000); f.timer()(); assert.equal(f.holds(), i - 1)
    f.gesture.pointerup(f.event()); f.gesture.pointerup(f.event()); assert.equal(f.holds(), i)
  }
})
test('clicks, double clicks and release before three seconds never toggle', () => {
  for (const elapsed of [0, 100, 2999]) {
    const f = fixture()
    for (let i = 0; i < 2; i++) { f.gesture.pointerdown(f.event()); f.tick(elapsed); f.gesture.pointerup(f.event()); f.gesture.click(f.event()) }
    assert.equal(f.holds(), 0); assert.equal(f.timer(), null)
  }
})
for (const reason of ['leave', 'scroll', 'pointercancel', 'blur', 'unmount']) test(`${reason} cancels the hold and timer`, () => {
  const f = fixture(); f.gesture.pointerdown(f.event()); f.tick(2500)
  if (reason === 'unmount') f.gesture.dispose(); else f.gesture.cancel()
  f.tick(1000); f.gesture.pointerup(f.event()); assert.equal(f.holds(), 0); assert.equal(f.timer(), null)
})
test('movement, secondary button and second pointer cancel; unrelated pointerup cannot commit', () => {
  const f = fixture(); f.gesture.pointerdown(f.event()); f.gesture.pointermove(f.event({ clientY: 40 })); f.tick(4000); f.gesture.pointerup(f.event()); assert.equal(f.holds(), 0)
  f.gesture.pointerdown(f.event({ button: 2 })); assert.equal(f.timer(), null)
  f.gesture.pointerdown(f.event()); f.gesture.pointerdown(f.event({ isPrimary: false, pointerId: 2 })); f.tick(4000); f.gesture.pointerup(f.event()); assert.equal(f.holds(), 0)
  f.gesture.pointerdown(f.event()); f.tick(3000); f.gesture.pointerup(f.event({ pointerId: 2 })); assert.equal(f.holds(), 0); f.gesture.pointerup(f.event()); assert.equal(f.holds(), 1)
})
test('keyboard hold commits on keyup, repeated keydown cannot retrigger and Escape cancels', () => {
  const f = fixture(); let prevented = 0
  for (const key of [' ', 'Enter']) {
    f.gesture.keydown(f.event({ key })); f.tick(3000); f.gesture.keydown(f.event({ key, repeat: true, preventDefault: () => { prevented++ } })); f.gesture.keyup(f.event({ key }))
  }
  assert.equal(f.holds(), 2); assert.equal(prevented, 2)
  f.gesture.keydown(f.event({ key: ' ' })); f.gesture.keydown(f.event({ key: 'Escape' })); f.tick(4000); f.gesture.keyup(f.event({ key: ' ' })); assert.equal(f.holds(), 2)
})
test('successful hold suppresses its follow-up click; disabled environments never arm', () => {
  const f = fixture(); let prevented = 0, stopped = 0
  f.gesture.pointerdown(f.event()); f.tick(3000); f.gesture.pointerup(f.event())
  f.gesture.click(f.event({ preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++ }))
  assert.equal(prevented, 1); assert.equal(stopped, 1)
  const off = fixture(false); off.gesture.pointerdown(off.event()); off.gesture.keydown(off.event({ key: 'Enter' })); assert.equal(off.timer(), undefined); assert.equal(off.holds(), 0)
})
