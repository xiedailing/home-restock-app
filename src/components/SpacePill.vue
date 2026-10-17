<script setup>
import { computed, nextTick, ref } from 'vue'
import { getSpaceColor } from '../models/space'
import chevronIcon from '../assets/settings/chevron.svg'

// 空間膠囊＋popover（specs/009 FR-910、UT-24）：「我的用品」與補貨頁共用。
// popover 以 absolute 錨定在最近的定位祖先（頁首），父層頁首需設 position: relative。
// 選項由父層傳入（「我的用品」與補貨頁都沒有「所有空間」，UT-30）；「新增空間」只發出事件，Sheet 由頁面自己放。
defineOptions({ inheritAttrs: false })

const props = defineProps({
  modelValue: { type: String, default: null },
  spaces: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue', 'add-space'])

const open = ref(false)
const pill = ref(null)
const popover = ref(null)

const current = computed(() => props.spaces.find((space) => space.id === props.modelValue))

// 空間代表色圓點：取色方式同 SpaceTag（getSpaceColor），圓點用較深的 dark 色才看得清楚。
function dotColor(space) {
  return getSpaceColor(space?.color).dark
}

function optionButtons() {
  return [...(popover.value?.querySelectorAll('.space-option') ?? [])]
}

async function openMenu() {
  open.value = true
  await nextTick()
  const buttons = optionButtons()
  const selected = buttons.find((button) => button.getAttribute('aria-selected') === 'true')
  ;(selected ?? buttons[0])?.focus()
}

function close({ restoreFocus = false } = {}) {
  open.value = false
  if (restoreFocus) pill.value?.focus()
}

function toggle() {
  if (open.value) close()
  else openMenu()
}

function select(spaceId) {
  close({ restoreFocus: true })
  emit('update:modelValue', spaceId)
}

function addSpace() {
  close()
  emit('add-space')
}

// 方向鍵在選項（含「新增空間」）間移動；Esc 關閉並把焦點還給膠囊。
function onPopoverKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close({ restoreFocus: true })
    return
  }
  const buttons = optionButtons()
  const index = buttons.indexOf(document.activeElement)
  let next = null
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
  else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = buttons.length - 1
  if (next === null) return
  event.preventDefault()
  buttons[next]?.focus()
}

// 焦點移到膠囊與浮層以外（例如 Tab 離開）時關閉。
function onFocusout(event) {
  const target = event.relatedTarget
  if (!open.value || !target) return
  if (popover.value?.contains(target) || pill.value?.contains(target)) return
  close()
}
</script>

<template>
  <button
    ref="pill"
    type="button"
    class="space-pill"
    :aria-expanded="open"
    aria-haspopup="listbox"
    :aria-label="current ? `切換空間，目前：${current.name}` : '切換空間'"
    @click="toggle"
    @keydown.down.prevent="open || openMenu()"
  >
    <span class="space-dot" :style="{ backgroundColor: dotColor(current) }" aria-hidden="true" />
    <span class="space-pill-name">{{ current?.name }}</span>
    <img class="space-pill-chevron" :src="chevronIcon" alt="" />
  </button>

  <!-- Space Popover：浮層，不推動下方版面。 -->
  <template v-if="open">
    <div class="space-popover-backdrop" @click="close()" />
    <div
      ref="popover"
      class="space-popover"
      role="listbox"
      aria-label="空間切換"
      @keydown="onPopoverKeydown"
      @focusout="onFocusout"
    >
      <button
        v-for="option in spaces"
        :key="option.id"
        type="button"
        role="option"
        class="space-option"
        :class="{ 'space-option--selected': modelValue === option.id }"
        :aria-selected="modelValue === option.id"
        @click="select(option.id)"
      >
        <span class="space-option-label">
          <span class="space-dot space-dot--sm" :style="{ backgroundColor: dotColor(option) }" aria-hidden="true" />
          <span class="space-option-name">{{ option.name }}</span>
        </span>
        <svg v-if="modelValue === option.id" class="space-check" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="space-popover-divider" />
      <button type="button" class="space-option space-action" @click="addSpace">
        <svg class="space-plus" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span>新增空間</span>
      </button>
    </div>
  </template>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

// 空間膠囊（UT-24）：整顆是按鈕，圓點＋名稱＋向下箭頭。
.space-pill {
  display: inline-flex;
  align-items: center;
  gap: t.$space-8;
  max-width: 100%;
  height: 40px;
  padding: 0 14px 0 12px;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  // 內框色沿用 v12 預覽，tokens 沒有對應色。
  box-shadow: inset 0 0 0 1px #d9d6cc, t.$shadow-raised;
  color: t.$text-main;
  font: t.$font-weight-bold #{t.$font-size-button} / 1.4 t.$font-family;
  cursor: pointer;

  &:active { background: t.$input-bg; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}

.space-pill-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-pill-chevron {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  transform: rotate(90deg);
}

.space-dot {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border-radius: 50%;

  &--sm { flex-basis: 12px; width: 12px; height: 12px; }
}

.space-popover-backdrop { position: fixed; inset: 0; z-index: 1; }

.space-popover {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 9px;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-popover;
  background: t.$card-bg;
  box-shadow: t.$shadow-floating;
}

.space-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  width: 100%;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 15px / normal t.$font-family;
  text-align: left;
  cursor: pointer;

  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }

  &--selected {
    background: t.$active-green;
    box-shadow: inset -1px -1px 4px rgba(255, 255, 255, .85), inset 1px 2px 5px rgba(138, 158, 136, .1);
    color: t.$primary-green;
    font-weight: t.$font-weight-bold;
  }
}

.space-option-label {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.space-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-check, .space-plus { flex: 0 0 18px; width: 18px; height: 18px; }

.space-popover-divider { height: 1px; margin-block: 4px; background: t.$border-color; }

.space-action {
  justify-content: flex-start;
  color: t.$primary-green;
  cursor: default;
}
</style>
