<script setup>
// 新增用品頁的「＋ 新增空間」Sheet；欄位、驗證與樣式複製自 SettingsAddSpace.vue（設定頁由組員維護，不共用以免互相影響）。
import { ref, computed, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import SwitchTrack from '../SwitchTrack.vue'
import SpaceColorPicker from '../SpaceColorPicker.vue'
import { limitSpaceName } from '../../models/space'
import { useItemsStore } from '../../stores/items'

defineProps({ open: Boolean })
const emit = defineEmits(['close', 'created'])
const itemsStore = useItemsStore()

const name = ref('')
const shared = ref(false)
const color = ref('green')
const error = ref('')
const nameInput = ref(null)

const nameLimitExceeded = computed(() => limitSpaceName(name.value.trim()) !== name.value.trim())
const nameFocused = ref(false)
const nameCountHint = computed(() => {
  const text = name.value
  const asciiOnly = /^[\x00-\x7F]*$/.test(text) && text.length > 0
  const count = asciiOnly ? Array.from(text).length : Array.from(text).reduce((total, char) => total + (char.codePointAt(0) <= 127 ? 0.5 : 1), 0)
  return `${count}/${asciiOnly ? 16 : 8}`
})

function reset() {
  name.value = ''
  shared.value = false
  color.value = 'green'
  error.value = ''
  if (nameInput.value) nameInput.value.value = ''
}

function updateNameInput(event) {
  // 組字期間保留輸入法內容，選字完成後移除所有空白。
  if (event.isComposing) return
  const input = event.target
  const cursor = input.selectionStart
  const value = input.value.replace(/\s/g, '')
  const nextCursor = input.value.slice(0, cursor).replace(/\s/g, '').length
  input.value = value
  name.value = value
  input.setSelectionRange(nextCursor, nextCursor)
}

function addSpace(close) {
  const spaceName = name.value.trim()
  if (!spaceName) {
    error.value = '請輸入空間名稱。'
    return
  }
  if (nameLimitExceeded.value) {
    error.value = '名稱過長，請縮短至 8 個中文字或 16 個英文字母以內。'
    return
  }
  const space = itemsStore.addSpace({ name: spaceName, shared: shared.value, color: color.value })
  emit('created', space)
  close()
}

function onClose() {
  reset()
  emit('close')
}
</script>

<template>
  <BottomSheet :open="open" labelledby="add-space-sheet-title" @close="onClose">
    <template #default="{ close }">
      <form class="add-space-sheet" @submit.prevent="addSpace(close)">
        <h2 id="add-space-sheet-title">空間設定</h2>
        <div class="space-fields">
          <div class="space-row">
            <label for="sheet-space-name">空間名稱</label>
            <div class="name-field">
              <input ref="nameInput" :class="{ 'limit-exceeded': nameLimitExceeded }" @focus="nameFocused = true" @blur="nameFocused = false" id="sheet-space-name" :value="name" placeholder="輸入名稱"
                :aria-invalid="!!error || nameLimitExceeded" :aria-describedby="error ? 'sheet-space-error' : undefined" @input="error = ''; updateNameInput($event)" @compositionend="updateNameInput" @keydown.space="!$event.isComposing && $event.keyCode !== 229 && $event.preventDefault()" />
              <span v-if="nameFocused || nameLimitExceeded" class="name-count">{{ nameCountHint }}</span>
              <p v-if="nameLimitExceeded" class="name-length-error">名稱過長，請縮短。</p>
            </div>
          </div>
          <div class="space-row sharing-row">
            <span id="sheet-space-usage-label">多人共享</span>
            <button type="button" class="space-switch" role="switch" :aria-checked="shared"
              aria-labelledby="sheet-space-usage-label" @click="shared = !shared">
              <SwitchTrack :checked="shared" />
            </button>
            <div class="sharing-hint-wrapper" :class="{ expanded: shared }" :aria-hidden="!shared">
              <div class="sharing-hint-content">
                <p class="sharing-hint">開啟後可邀請成員加入，最多 10 人。</p>
              </div>
            </div>
          </div>
          <fieldset class="color-field">
            <legend>空間代表色</legend>
            <SpaceColorPicker v-model="color" />
          </fieldset>
        </div>
        <p v-if="error" id="sheet-space-error" class="space-error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn-primary add-space-button">新增空間</button>
      </form>
    </template>
  </BottomSheet>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.add-space-sheet { display: flex; flex-direction: column; gap: t.$space-16; }
h2 { margin: 0; font: 700 17px / normal t.$font-family; }
.space-fields {
  padding: t.$space-16;
  border: 1px solid rgba(237, 234, 227, .4);
  border-radius: 20px;
  background: #fbfaf6;
  box-shadow: t.$shadow-card;
  overflow: hidden;
}
.space-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: t.$space-12 t.$space-16;
  position: relative;
  color: t.$text-body;
  font-size: 14px;
  line-height: 20px;
  > :first-child { flex: 1; }
  &::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: t.$border-color; }
  input {
    max-width: 100%;
    width: 100%;
    height: 36px;
    padding: 0 52px 0 12px;
    border: 0;
    border-radius: t.$radius-input;
    background: t.$input-bg;
    color: t.$text-main;
    box-shadow: t.$shadow-inset;
    font: 400 15px / 21px t.$font-family;
    &::placeholder { color: t.$text-disabled; }
  }
}
.name-field { position: relative; width: 196px; max-width: 65%; min-width: 0; }
.name-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.name-count { position: absolute; right: t.$space-12; top: 18px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; white-space: nowrap; pointer-events: none; }
.space-row input:focus { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.space-row input.limit-exceeded { outline: 2px solid t.$accent-text; outline-offset: 2px; }
.space-switch {
  flex: 0 0 t.$switch-width;
  width: t.$switch-width;
  height: t.$switch-height;
  padding: 0;
  border: 0;
  border-radius: t.$switch-radius;
  background: transparent;
}
.color-field {
  min-width: 0;
  width: calc(100% + t.$space-16);
  padding: t.$space-12 0 0 t.$space-16;
  margin: 0 calc(-1 * t.$space-16) 0 0;
  border: 0;
  legend { float: left; width: 100%; margin: 0 0 t.$space-8; font: 400 14px / 20px t.$font-family; color: t.$text-body; }
}
.sharing-row { flex-wrap: wrap; row-gap: 0; }
.sharing-hint { margin: t.$space-8 0 0; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.sharing-hint-wrapper {
  flex-basis: 100%;
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows .5s ease, opacity .5s ease;
  &.expanded { grid-template-rows: 1fr; opacity: 1; }
}
.sharing-hint-content { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .sharing-hint-wrapper { transition: none; }
}
.space-error { margin: 0; font-size: 13px; color: t.$danger; }
.add-space-button { width: 100%; min-height: t.$button-height; font: 700 16px / 22px t.$font-family; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
