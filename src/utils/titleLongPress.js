// Commit on release: pointerup/keyup retains browser user activation for permission requests.
export function createTitleLongPress(onHold, { enabled = () => true, now = () => performance.now(), delay = 3000, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let active = null, timer, ready = false, suppressUntil = 0
  function cancel() { unschedule(timer); timer = undefined; active = null; ready = false }
  function begin(kind, id, x = 0, y = 0) {
    if (!enabled()) return
    if (active) { cancel(); return }
    active = { kind, id, x, y, started: now() }; ready = false
    timer = schedule(() => { ready = true }, delay)
  }
  function finish(kind, id, event) {
    if (!active || active.kind !== kind || active.id !== id) return
    const completed = enabled() && (ready || now() - active.started >= delay)
    cancel()
    if (completed) { suppressUntil = now() + 1000; event.preventDefault?.(); onHold() }
  }
  return {
    pointerdown(event) {
      if (event.button !== 0 || event.isPrimary === false) { cancel(); return }
      begin('pointer', event.pointerId, event.clientX, event.clientY)
    },
    pointermove(event) {
      if (active?.kind === 'pointer' && event.pointerId === active.id && Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) cancel()
    },
    pointerup(event) { finish('pointer', event.pointerId, event) },
    keydown(event) {
      if (!enabled()) return
      if (event.key === 'Escape') { cancel(); return }
      if (![' ', 'Enter'].includes(event.key)) return
      event.preventDefault()
      if (!event.repeat) begin('key', event.key)
    },
    keyup(event) { finish('key', event.key, event) },
    click(event) { if (now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation() } },
    cancel, dispose: cancel,
  }
}
