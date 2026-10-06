<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { limitSpaceName } from '../models/space'
import { useItemsStore } from '../stores/items'
import chevron from '../assets/settings/chevron.svg'
import SwitchTrack from '../components/SwitchTrack.vue'
import SpaceColorPicker from '../components/SpaceColorPicker.vue'

const router = useRouter()
const itemsStore = useItemsStore()
const name = ref('')
const shared = ref(false)
const color = ref('green')
const error = ref('')

const nameLimitExceeded = computed(() => limitSpaceName(name.value.trim()) !== name.value.trim())
const nameFocused = ref(false)
const nameCountHint = computed(() => {
  const text = name.value
  const asciiOnly = /^[\x00-\x7F]*$/.test(text) && text.length > 0
  const count = asciiOnly ? Array.from(text).length : Array.from(text).reduce((total, char) => total + (char.codePointAt(0) <= 127 ? 0.5 : 1), 0)
  return `${count}/${asciiOnly ? 16 : 8}`
})
function updateNameInput(event) {
  // 保留組字與超限內容，只在儲存時檢查。
  name.value = event.target.value
}

function addSpace() {
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
  router.push({ name: 'spaces', query: { spaceCreated: space.name } })
}
</script>

<template>
  <form class="add-space-page" @submit.prevent="addSpace">
    <header class="space-header">
      <RouterLink :to="{ name: 'spaces' }" class="back-button" aria-label="返回空間管理">
        <img :src="chevron" alt="" />
      </RouterLink>
      <h1>新增空間</h1>
      <span aria-hidden="true" />
    </header>

    <section aria-labelledby="space-settings-title">
      <h2 id="space-settings-title">空間設定</h2>
      <div class="space-fields">
        <div class="space-row">
          <label for="space-name">空間名稱</label>
          <div class="name-field">
          <input :class="{ 'limit-exceeded': nameLimitExceeded }" @focus="nameFocused = true" @blur="nameFocused = false" id="space-name" v-model="name" placeholder="輸入名稱" required
            :aria-invalid="!!error || nameLimitExceeded" :aria-describedby="error ? 'space-error' : undefined" @input="error = ''; updateNameInput($event)" @compositionend="updateNameInput" />
          <p v-if="nameFocused || nameLimitExceeded" class="name-count">字數提醒：{{ nameCountHint }}</p>
          <p v-if="nameLimitExceeded" class="name-length-error">名稱過長，請縮短。</p>
          </div>
        </div>
        <div class="space-row">
          <span id="space-usage-label">多人共享</span>
          <button type="button" class="space-switch" role="switch" :aria-checked="shared"
            aria-labelledby="space-usage-label" @click="shared = !shared">
            <SwitchTrack :checked="shared" />
          </button>
        </div>
        <div class="sharing-hint-wrapper" :class="{ expanded: shared }" :aria-hidden="!shared">
          <div class="sharing-hint-content">
            <p class="sharing-hint">開啟後可邀請成員加入，最多 10 人。</p>
          </div>
        </div>
        <fieldset class="color-field">
          <legend>空間代表色</legend>
          <SpaceColorPicker v-model="color" />
        </fieldset>
      </div>
      <p v-if="error" id="space-error" class="space-error" role="alert">{{ error }}</p>
    </section>
    <button type="submit" class="btn btn-primary add-space-button">新增空間</button>
  </form>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.add-space-page {
  width: 100%;
  max-width: 358px;
  min-height: calc(100svh - 167px);
  margin-inline: auto;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  color: t.$text-main;
  font-family: t.$font-family;
}
.space-header {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: 700 17px / 24px t.$font-family; }
}
.back-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  img { width: 24px; height: 24px; transform: rotate(180deg); }
}
h2 { margin: 0 0 t.$space-16; font: 700 16px / 22px t.$font-family; }
.space-fields {
  padding: t.$space-16;
  border: 1px solid rgba(237, 234, 227, .55);
  border-radius: 20px;
  background: #fbfaf6;
  box-shadow: t.$shadow-inset;
  overflow: hidden;
}
.space-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: t.$space-8 t.$space-16;
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
    padding: 0 12px;
    border: 0;
    border-radius: t.$radius-input;
    background: t.$input-bg;
    color: t.$text-main;
    box-shadow: t.$shadow-inset;
    font: 400 15px / 21px t.$font-family;
    &::placeholder { color: t.$text-disabled; }
  }
}
.name-field { width: 196px; max-width: 60%; }
.name-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.name-count { margin: 6px 0 0; color: t.$text-disabled; font-size: t.$font-size-caption; }
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
  margin: t.$space-12 calc(-1 * t.$space-16) 0 0;
  border: 0;
  legend { float: left; width: 100%; margin: 0 0 t.$space-8; font: 400 14px / 20px t.$font-family; color: t.$text-body; }
}
.space-hint { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: t.$text-sub; }
.sharing-hint { margin: t.$space-8 t.$space-16 0; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.sharing-hint-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows .3s ease, opacity .3s ease;
  &.expanded { grid-template-rows: 1fr; opacity: 1; }
}
.sharing-hint-content { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .sharing-hint-wrapper { transition: none; }
}
.space-error { margin: 8px 0; font-size: 13px; color: t.$danger; }
.add-space-button { width: 100%; max-width: 314px; min-height: 48px; margin: auto auto 0; font: 700 16px / 22px t.$font-family; }
button { cursor: pointer; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
