<script setup>
// 全域用品新增頁（009 FR-909）：不建立空間用品或補貨紀錄。
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { useCatalogStore } from '../stores/catalog'
import { ITEM_STATUS, UNITS, matchItemIconKey } from '../models/item'
import { limitSpaceName } from '../models/space'
import { getItemIcon } from '../assets/household-icons-by-state/index.js'
import ItemIconEditor from '../components/ItemIconEditor.vue'
import backIcon from '../assets/add-item/back-chevron.svg'
import selectorChevron from '../assets/add-item/selector-chevron.svg'
import pillCheck from '../assets/add-item/pill-check.svg'

const router = useRouter()
const itemsStore = useItemsStore()
const catalog = useCatalogStore()
const route = useRoute()
const fromItemManagement = route.query.from === 'item-management'
// ?category= 預設類別：從用品管理分類頁、補貨頁（選了類別 pills）進來都會帶。
const initialCategory = typeof route.query.category === 'string' && itemsStore.categoryOptions.includes(route.query.category) ? route.query.category : null
const CUSTOM_UNIT = 'custom'
const name = ref('')
const category = ref(initialCategory)
const unitChoice = ref(null)
const customUnit = ref('')
const unit = computed(() => unitChoice.value === CUSTOM_UNIT ? customUnit.value.trim() : unitChoice.value ?? '')
const openPanel = ref(null)
const submitted = ref(false)
const submitting = ref(false)
const saveError = ref('')
const duplicateName = computed(() => catalog.isNameTaken(name.value))
const nameField = ref(null)
const categoryField = ref(null)
const unitField = ref(null)
const customUnitField = ref(null)
const errors = computed(() => {
  if (!submitted.value) return {}
  const result = {}
  if (!name.value.trim()) result.name = '請輸入用品名稱。'
  if (!category.value) result.category = '請選擇類別。'
  if (!unit.value) result.unit = unitChoice.value === CUSTOM_UNIT ? '請輸入自訂單位。' : '請選擇單位。'
  return result
})
function updateName(event) {
  if (event.isComposing) return
  const limited = limitSpaceName(event.target.value)
  event.target.value = limited
  name.value = limited
  saveError.value = ''
}
const iconManual = ref(false)
const pickedIconKey = ref(null)
const iconPhoto = ref(null)
const iconError = ref('')
const iconKey = computed(() => iconManual.value ? pickedIconKey.value : matchItemIconKey(name.value.trim()))
const iconSrc = computed(() => iconPhoto.value || getItemIcon(iconKey.value, ITEM_STATUS.IN_STOCK))
function selectPresetIcon(key) {
  iconError.value = ''
  pickedIconKey.value = key
  iconPhoto.value = null
  iconManual.value = true
}
function applyIconPhoto(dataUrl) {
  iconError.value = ''
  pickedIconKey.value = iconKey.value
  iconPhoto.value = dataUrl
  iconManual.value = true
}
function togglePanel(panel) { openPanel.value = openPanel.value === panel ? null : panel }
function selectCategory(value) { category.value = value; openPanel.value = null }
async function selectUnit(value) {
  unitChoice.value = value
  openPanel.value = value === CUSTOM_UNIT ? 'unit' : null
  if (value === CUSTOM_UNIT) { await nextTick(); customUnitField.value?.focus() }
}
function finishCustomUnit() {
  if (!customUnit.value.trim()) return
  openPanel.value = null
  unitField.value?.querySelector('button')?.focus({ preventScroll: true })
}

// 保留既有放棄確認，圖片或手動圖示選擇也算有修改。
const isDirty = computed(() => !!(name.value.trim() || category.value !== initialCategory || unitChoice.value || customUnit.value.trim() || iconManual.value || iconPhoto.value))
const discardDialog = ref(null)
let allowLeave = false
let pendingRoute = null
function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'inventory' })
}
onBeforeRouteLeave(to => {
  if (allowLeave || !isDirty.value) return true
  pendingRoute = to
  if (!discardDialog.value?.open) discardDialog.value?.showModal()
  return false
})
function discard() {
  allowLeave = true
  discardDialog.value?.close()
  const target = pendingRoute
  pendingRoute = null
  if (target && target.fullPath === window.history.state?.back) router.back()
  else if (target) router.push(target)
  else goBack()
}
async function createItem() {
  if (submitting.value || duplicateName.value) return
  submitted.value = true
  saveError.value = ''
  const firstError = ['name', 'category', 'unit'].find(key => errors.value[key])
  if (firstError) {
    openPanel.value = firstError === 'name' ? null : firstError
    await nextTick()
    const field = firstError === 'name' ? nameField.value : firstError === 'category' ? categoryField.value : unitChoice.value === CUSTOM_UNIT ? customUnitField.value : unitField.value
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (field?.matches('input')) field.focus({ preventScroll: true })
    else field?.querySelector('button')?.focus({ preventScroll: true })
    return
  }
  submitting.value = true
  try {
    const created = catalog.addCatalogItem({ name: name.value.trim(), iconKey: iconKey.value,
      iconPhoto: iconPhoto.value, iconManual: iconManual.value, category: category.value, unit: unit.value })
    if (!created) { saveError.value = duplicateName.value ? '' : '無法新增用品，請確認欄位後再試一次。'; submitting.value = false; return }
    if (fromItemManagement) catalog.clearJustAddedId()
    allowLeave = true
    router.back()
  } catch {
    submitting.value = false
    saveError.value = '無法新增用品，請稍後再試。'
  }
}

// 將固定按鈕保持在可見視窗底部，並替鍵盤與按鈕保留可捲動範圍。
const keyboardInset = ref(0)
const page = ref(null)
let viewportFrame = null
function updateViewport() {
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame)
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = null
    const viewport = window.visualViewport
    keyboardInset.value = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
    const focused = document.activeElement
    if (focused?.matches('input') && page.value?.contains(focused)) {
      const rect = focused.getBoundingClientRect()
      const visibleBottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 100
      if (rect.bottom > visibleBottom || rect.top < (viewport?.offsetTop || 0)) focused.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
  })
}
onMounted(() => {
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  window.addEventListener('resize', updateViewport)
  updateViewport()
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
  window.removeEventListener('resize', updateViewport)
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame)
})
</script>

<template>
  <form ref="page" class="add-item-page" :style="{ '--keyboard-inset': `${keyboardInset}px` }" novalidate @submit.prevent="createItem" @focusin="updateViewport" @focusout="updateViewport">
    <header class="app-bar"><button type="button" class="back-button" aria-label="返回" @click="goBack"><img :src="backIcon" alt="" /></button><h1>新增用品</h1><span aria-hidden="true" /></header>
    <div class="icon-preview"><ItemIconEditor :icon-key="iconKey" :icon-photo="iconPhoto" @select-preset="selectPresetIcon" @apply-photo="applyIconPhoto" @error="iconError = $event"><span class="icon-circle"><img :class="{ 'item-photo': iconPhoto }" :src="iconSrc" alt="" /></span></ItemIconEditor></div>
    <p v-if="iconError" class="icon-error" role="alert">{{ iconError }}</p>
    <section class="soft-card" aria-label="用品資料">
      <div class="field-section">
        <div class="name-row"><label for="item-name" :class="{ 'field-label-error': !!errors.name }">名稱 <span class="required" aria-hidden="true">*</span></label><input id="item-name" ref="nameField" :value="name" type="text" required placeholder="請輸入" autocomplete="off" :aria-invalid="!!errors.name || duplicateName" :aria-describedby="duplicateName ? 'name-duplicate' : undefined" @input="updateName" @compositionend="updateName" @keydown.enter="event => { if (!event.isComposing && event.keyCode !== 229) { event.preventDefault(); nameField.blur() } }" /></div>
        <p v-if="duplicateName" id="name-duplicate" class="duplicate-hint" role="alert">此用品已經存在</p>
      </div>
      <div ref="categoryField" class="field-section">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" aria-controls="category-options" :aria-invalid="!!errors.category" @click="togglePanel('category')"><span class="selector-label" :class="{ 'field-label-error': !!errors.category }">類別 <span class="required" aria-hidden="true">*</span></span><span class="selector-value" :class="{ placeholder: !category }">{{ category || '請選擇' }}</span><img :src="selectorChevron" :class="{ expanded: openPanel === 'category' }" alt="" /></button>
        <div v-if="openPanel === 'category'" id="category-options" class="inline-options pills" role="group" aria-label="類別"><button v-for="option in itemsStore.categoryOptions" :key="option" type="button" class="pill" :class="{ selected: category === option }" :aria-pressed="category === option" @click="selectCategory(option)"><img v-if="category === option" :src="pillCheck" alt="" />{{ option }}</button></div>
      </div>
      <div ref="unitField" class="field-section">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" aria-controls="unit-options" :aria-invalid="!!errors.unit" @click="togglePanel('unit')"><span class="selector-label" :class="{ 'field-label-error': !!errors.unit }">單位 <span class="required" aria-hidden="true">*</span></span><span class="selector-value" :class="{ placeholder: !unit }">{{ unit || '請選擇' }}</span><img :src="selectorChevron" :class="{ expanded: openPanel === 'unit' }" alt="" /></button>
        <div v-if="openPanel === 'unit'" id="unit-options" class="inline-options"><div class="pills" role="group" aria-label="單位"><button v-for="option in [...UNITS, CUSTOM_UNIT]" :key="option" type="button" class="pill" :class="{ selected: unitChoice === option }" :aria-pressed="unitChoice === option" @click="selectUnit(option)"><img v-if="unitChoice === option" :src="pillCheck" alt="" />{{ option === CUSTOM_UNIT ? '自訂單位' : option }}</button></div><div v-if="unitChoice === CUSTOM_UNIT" class="custom-unit"><label for="custom-unit" :class="{ 'field-label-error': !!errors.unit }">自訂單位 <span class="required" aria-hidden="true">*</span></label><input id="custom-unit" ref="customUnitField" v-model="customUnit" type="text" maxlength="4" placeholder="例如：盒、袋、罐" :aria-invalid="!!errors.unit" @keydown.enter="event => { if (!event.isComposing && event.keyCode !== 229) { event.preventDefault(); finishCustomUnit() } }" /><button type="button" class="pill" @click="finishCustomUnit">完成</button></div></div>
      </div>
    </section>
    <p v-if="saveError" class="inline-hint" role="alert">{{ saveError }}</p>
    <div class="bottom-cta"><button type="submit" class="btn btn-primary create-button" :disabled="duplicateName || submitting">儲存</button></div>
    <dialog ref="discardDialog" class="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-desc" @close="pendingRoute = null"><h2 id="discard-title">放棄新增？</h2><p id="discard-desc">你填寫的內容尚未建立，離開後將不會保留。</p><div class="discard-actions"><button type="button" class="discard-cancel" @click="discardDialog.close()">取消</button><button type="button" class="discard-confirm" @click="discard">放棄新增</button></div></dialog>
  </form>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.add-item-page { box-sizing: border-box; width: 100%; max-width: 358px; margin-inline: auto; padding: t.$space-16 0 calc(128px + var(--keyboard-inset, 0px)); display: flex; flex-direction: column; gap: t.$space-16; color: t.$text-main; font-family: t.$font-family; text-align: left; }
button { cursor: pointer; font-family: t.$font-family; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.app-bar { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; h1 { margin: 0; text-align: center; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; letter-spacing: .5px; } }
.back-button { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border: 0; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
.icon-preview { display: flex; justify-content: center; padding: t.$space-8 0 t.$space-16; }
.icon-circle { width: 80px; height: 80px; display: grid; place-items: center; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; overflow: hidden; img { width: 56px; height: 56px; } .item-photo { width: 100%; height: 100%; object-fit: cover; } }
.icon-error { margin: 0; color: t.$accent-text; text-align: center; font-size: t.$font-size-caption; }
.soft-card { border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; overflow: hidden; }
.field-section { &:not(:last-child) { border-bottom: 1px solid t.$border-color; } }
.name-row, .selector-row { box-sizing: border-box; display: flex; width: 100%; min-height: 60px; padding: t.$space-12 t.$space-16; align-items: center; gap: t.$space-8; }
.name-row label, .selector-label { flex-shrink: 0; color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-body-sm} / 20px t.$font-family; }
.required { color: t.$danger; }
.name-row .field-label-error, .selector-row .field-label-error, .custom-unit .field-label-error { color: t.$danger; }
.name-row input { min-width: 0; flex: 1; width: 100%; min-height: 36px; padding: 0; border: 0; border-radius: t.$radius-input; background: transparent; color: t.$text-main; text-align: right; font: t.$font-weight-regular 16px / 22px t.$font-family; &::placeholder { color: t.$text-disabled; } }
.selector-row { border: 0; background: transparent; text-align: left; img { width: 16px; height: 16px; flex-shrink: 0; transition: transform .3s ease; &.expanded { transform: rotate(-90deg); } } }
.selector-label { flex: 1; }
.selector-value { min-width: 0; overflow-wrap: anywhere; text-align: right; color: t.$text-main; font: t.$font-weight-medium #{t.$font-size-body-sm} / 20px t.$font-family; &.placeholder { color: t.$text-disabled; font-weight: t.$font-weight-regular; } }
.inline-options { padding: 0 t.$space-16 t.$space-16; }
.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; }
.pill { display: inline-flex; align-items: center; gap: t.$space-4; padding: t.$space-8 t.$space-12; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-caption} / 18px t.$font-family; &.selected { background: t.$primary-soft; color: t.$primary-green; font-weight: t.$font-weight-medium; box-shadow: t.$shadow-inset; } img { width: 14px; height: 14px; } }
.custom-unit { display: flex; align-items: center; flex-wrap: wrap; gap: t.$space-8; margin-top: t.$space-16; label { font-size: t.$font-size-caption; } input { box-sizing: border-box; min-width: 0; flex: 1; width: 120px; padding: t.$space-12; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: t.$font-weight-regular 16px / 22px t.$font-family; } }
.inline-hint { box-sizing: border-box; margin: 0 t.$space-16 t.$space-12; padding: t.$space-8 t.$space-12; border-radius: t.$radius-md; background: t.$accent-soft; color: t.$accent-text; font: t.$font-weight-regular #{t.$font-size-metadata} / normal t.$font-family; }
.duplicate-hint { margin: 0 t.$space-16 t.$space-12; color: t.$accent-text; font-size: t.$font-size-metadata; }
.bottom-cta { position: fixed; inset: auto 0 var(--keyboard-inset, 0px); z-index: 10; box-sizing: border-box; display: flex; justify-content: center; padding: t.$space-16 t.$space-16 max(20px, env(safe-area-inset-bottom)); border-radius: t.$radius-card t.$radius-card 0 0; background: t.$card-bg; }
.create-button { width: 100%; max-width: 358px; min-height: t.$button-height; border-radius: t.$radius-pill; font: t.$font-weight-bold #{t.$font-size-button} / normal t.$font-family; &:disabled { background: t.$text-disabled; color: t.$text-inverse; border: 0; box-shadow: none; cursor: default; } }
.discard-dialog {
  width: min(300px, calc(100% - 32px));
  margin: auto;
  padding: t.$space-24 18px;
  border: 0;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  color: t.$text-main;
  box-shadow: 0 14px 16px rgba(140, 136, 127, .2);
  text-align: center;
  &::backdrop { background: rgba(29, 29, 31, .35); }
  &:focus { outline: none; }
  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold 18px / 1.45 t.$font-family; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular 15px / 1.45 t.$font-family; }
}
.discard-actions { display: flex; gap: t.$space-12; margin-top: t.$space-24; }
.discard-cancel, .discard-confirm {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 t.$space-24;
  border: 0;
  border-radius: t.$radius-pill;
  font: t.$font-weight-medium 15px / normal t.$font-family;
}
.discard-cancel { background: t.$input-bg; box-shadow: t.$shadow-raised; color: t.$text-button-secondary; }
.discard-confirm {
  background: t.$danger;
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}

@media (prefers-reduced-motion: reduce) { .selector-row img { transition: none; } }
</style>
