<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
const props = defineProps({ modelValue: { type: String, default: '08:00' }, active: Boolean })
const emit = defineEmits(['update:modelValue', 'expand'])
const columns = [{ key: 'hour', label: '時', count: 24 }, { key: 'minute', label: '分', count: 60 }]
const wheels = {}
const timers = {}
const rowHeight = 36
const parts = computed(() => props.modelValue.split(':').map(Number))
const scrolling = ref(false)
const expanded = ref(false)
const panelId = useId()
function collapse() {
  expanded.value = false
  scrolling.value = false
  Object.values(timers).forEach(clearTimeout)
}
async function toggleExpanded() {
  if (expanded.value) { collapse(); return }
  expanded.value = true
  emit('expand')
  scrolling.value = false
  await sync()
}
function valueFor(key) { return parts.value[key === 'hour' ? 0 : 1] || 0 }
function select(key, value) {
  const next = [...parts.value]
  next[key === 'hour' ? 0 : 1] = value
  emit('update:modelValue', next.map(n => String(n).padStart(2, '0')).join(':'))
}
function move(column, value) {
  const next = Math.max(0, Math.min(column.count - 1, value))
  clearTimeout(timers[column.key])
  select(column.key, next)
  wheels[column.key]?.scrollTo({ top: next * rowHeight, behavior: 'instant' })
}
function onScroll(column) {
  scrolling.value = true
  clearTimeout(timers[column.key])
  // Save the closest row while moving, so tapping Save immediately uses the visible time.
  select(column.key, Math.max(0, Math.min(column.count - 1, Math.round(wheels[column.key].scrollTop / rowHeight))))
  timers[column.key] = setTimeout(() => { scrolling.value = false; sync() }, 160)
}
function keydown(event, column) {
  const current = valueFor(column.key)
  const next = { ArrowUp: current - 1, ArrowDown: current + 1, Home: 0, End: column.count - 1, PageUp: current - 5, PageDown: current + 5 }[event.key]
  if (next === undefined) return
  event.preventDefault()
  move(column, next)
}
async function sync() {
  await nextTick()
  if (scrolling.value) return
  for (const column of columns) if (wheels[column.key]) wheels[column.key].scrollTop = valueFor(column.key) * rowHeight
}
watch(() => props.modelValue, sync)
watch(() => props.active, collapse, { flush: 'post' })
defineExpose({ collapse })
onMounted(sync)
onBeforeUnmount(() => Object.values(timers).forEach(clearTimeout))
</script>

<template>
  <fieldset class="time-picker">
    <legend>提醒時間</legend>
    <button type="button" class="time-toggle" :aria-expanded="expanded" :aria-controls="panelId" @click="toggleExpanded">
      <span><i class="fa-regular fa-clock" aria-hidden="true" /> {{ modelValue }}</span>
      <i class="fa-solid fa-chevron-down" :class="{ expanded }" aria-hidden="true" />
    </button>
    <div :id="panelId" class="time-reveal" :class="{ open: expanded }" :inert="!expanded" :aria-hidden="!expanded" @keydown.esc.stop.prevent="collapse">
      <div class="time-reveal-inner">
        <div class="time-wheels">
      <div class="time-selection" aria-hidden="true" />
      <template v-for="column in columns" :key="column.key">
        <div :ref="element => wheels[column.key] = element" class="time-wheel" role="spinbutton" tabindex="0"
          :aria-label="`提醒時間：${column.label}`" :aria-valuemin="0" :aria-valuemax="column.count - 1" :aria-valuenow="valueFor(column.key)"
          :aria-valuetext="`${String(valueFor(column.key)).padStart(2, '0')} ${column.label}`"
          @scroll="onScroll(column)" @keydown="keydown($event, column)">
          <div v-for="number in column.count" :key="number" class="time-option" :class="{ selected: valueFor(column.key) === number - 1 }" aria-hidden="true" @click="move(column, number - 1)">{{ String(number - 1).padStart(2, '0') }}</div>
        </div>
        <span class="time-unit" aria-hidden="true">{{ column.label }}</span>
      </template>
        </div>
      </div>
    </div>
  </fieldset>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.time-picker { min-width: 0; margin: 0; padding: 0; border: 0; }
legend { float: none; width: auto; margin-bottom: 4px; color: t.$text-sub; font-size: t.$font-size-body-sm; }
.time-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 48px; padding: 0 t.$space-16; border: 0; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: t.$font-weight-medium #{t.$font-size-body} / 1.4 t.$font-family; cursor: pointer; span { display: flex; align-items: center; gap: t.$space-12; } > i { font-size: 12px; transition: transform .5s ease; &.expanded { transform: rotate(180deg); } } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; } }
.time-reveal { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .5s ease, opacity .25s ease; &.open { grid-template-rows: 1fr; opacity: 1; } }
.time-reveal-inner { min-height: 0; overflow: hidden; }
.time-wheels { margin-top: t.$space-8; position: relative; display: flex; align-items: center; justify-content: center; height: 180px; border-radius: t.$radius-popover; background: t.$input-bg; overflow: hidden; }
.time-selection { position: absolute; inset: 72px 12px; border-radius: 10px; background: t.$primary-soft; pointer-events: none; }
.time-wheel { position: relative; flex: 0 1 90px; height: 180px; padding-block: 72px; box-sizing: border-box; overflow-y: auto; overscroll-behavior-y: contain; scroll-snap-type: y mandatory; scrollbar-width: none; touch-action: pan-y; mask-image: linear-gradient(transparent, black 35%, black 65%, transparent); &::-webkit-scrollbar { display: none; } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; } }
.time-option { height: 36px; scroll-snap-align: center; text-align: center; color: t.$text-sub; font: 400 24px / 36px t.$font-family; cursor: pointer; user-select: none; &.selected { color: t.$primary-green; font-weight: 700; } }
.time-unit { position: relative; margin-right: 12px; color: t.$text-sub; font-size: t.$font-size-body-sm; }
@media (prefers-reduced-motion: reduce) { .time-reveal, .time-toggle > i { transition: none; } }
</style>
