<script setup>
// 全域用品新增頁（009 FR-909）：不建立空間用品或補貨紀錄。
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { useUnitOptionsStore } from '../stores/unitOptions'
import { useCatalogStore } from '../stores/catalog'
import { SYSTEM_CATEGORIES } from '../models/itemCategories'
import { ITEM_STATUS, UNITS, matchItemIconKey } from '../models/item'
import { limitSpaceName, formatNameCount } from '../models/space'
import { getItemIcon } from '../assets/household-icons-by-state/index.js'
import AppToast from '../components/AppToast.vue'
import { useUnitManagement } from '../composables/useUnitManagement'
import ItemIconEditor from '../components/ItemIconEditor.vue'
import backIcon from '../assets/add-item/back-chevron.svg'
import selectorChevron from '../assets/add-item/selector-chevron.svg'
import pillCheck from '../assets/add-item/pill-check.svg'

const router = useRouter()
const itemsStore = useItemsStore()
const catalog = useCatalogStore()
const unitOptions = useUnitOptionsStore()
const presetCategories = computed(() => itemsStore.categoryOptions.filter(name => SYSTEM_CATEGORIES.includes(name)))
const customCategories = computed(() => itemsStore.categoryOptions.filter(name => !SYSTEM_CATEGORIES.includes(name)))
const { editingUnits, unitOptionError, deleteUnitDialog, pendingUnitDeletion, unitToast,
  undoUnitRemoval, requestUnitDeletion, cancelUnitDeletion, confirmUnitDeletion, removeCustomUnit } = useUnitManagement(value => {
  if (unit.value === value) { unitChoice.value = null; customUnit.value = '' }
})
const route = useRoute()
const fromItemManagement = route.query.from === 'item-management'
// 兩種入口共用初始欄位與畫面；來源僅用於儲存後的 justAddedId 處理。
const initialCategory = typeof route.query.category === 'string' && route.query.category !== '全部' && itemsStore.categoryOptions.includes(route.query.category) ? route.query.category : null
const CUSTOM_UNIT = 'custom'
const name = ref('')
const nameFocused = ref(false)
const nameLimitExceeded = computed(() => limitSpaceName(name.value.trim()) !== name.value.trim())
const nameCountHint = computed(() => formatNameCount(name.value))
const category = ref(initialCategory)
const unitChoice = ref(null)
const customUnit = ref('')
const customUnitFocused = ref(false)
const customUnitCount = computed(() => `${Array.from(customUnit.value).length}/4`)
const duplicateCustomUnit = computed(() => unitOptions.isNameTaken(customUnit.value))
const customUnitLimitExceeded = computed(() => Array.from(customUnit.value.trim()).length > 4)
const unitOptionMessage = computed(() => unitChoice.value === CUSTOM_UNIT && customUnitLimitExceeded.value ? '名稱過長，請縮短。' : unitChoice.value === CUSTOM_UNIT && duplicateCustomUnit.value ? '此單位已經存在' : unitOptionError.value)
const unit = computed(() => unitChoice.value === CUSTOM_UNIT ? customUnit.value.trim() : unitChoice.value ?? '')
const openPanel = ref(null)
const submitted = ref(false)
const submitting = ref(false)
const saveError = ref('')
const createdItemId = ref(null)
const duplicateName = computed(() => catalog.isNameTaken(name.value, createdItemId.value))
const nameField = ref(null)
const categoryField = ref(null)
const unitField = ref(null)
const customUnitField = ref(null)
const customCategoryField = ref(null)
const addingCategory = ref(false)
const customCategoryName = ref('')
const customCategoryError = ref('')
const duplicateCustomCategory = computed(() => itemsStore.validateCategoryName(customCategoryName.value).code === 'NAME_TAKEN')
const customCategoryMessage = computed(() => customCategoryLimitExceeded.value ? '名稱過長，請縮短。' : duplicateCustomCategory.value ? '已有重複分類名稱' : customCategoryError.value)
const customCategoryFocused = ref(false)
const customCategoryCount = computed(() => formatNameCount(customCategoryName.value))
const customCategoryLimitExceeded = computed(() => limitSpaceName(customCategoryName.value.trim()) !== customCategoryName.value.trim())
const canFinishCategory = computed(() => !!customCategoryName.value.trim() && !customCategoryLimitExceeded.value && !duplicateCustomCategory.value)
const canFinishUnit = computed(() => !editingUnits.value && !!customUnit.value.trim() && Array.from(customUnit.value.trim()).length <= 4 && !duplicateCustomUnit.value)
async function openCustomCategory() {
  addingCategory.value = true
  customCategoryError.value = ''
  await nextTick()
  customCategoryField.value?.focus({ preventScroll: true })
}
function finishCustomCategory() {
  if (!customCategoryName.value.trim() || customCategoryLimitExceeded.value) return
  if (duplicateCustomCategory.value) { customCategoryError.value = '已有重複分類名稱'; return }
  const value = customCategoryName.value.trim()
  const result = itemsStore.addCategory(value)
  if (!result.ok) { customCategoryError.value = result.message; return }
  selectCategory(value)
  customCategoryName.value = ''
  customCategoryError.value = ''
  addingCategory.value = false
}
const errors = computed(() => {
  if (!submitted.value) return {}
  const result = {}
  if (!name.value.trim()) result.name = '請輸入用品名稱。'
  else if (nameLimitExceeded.value) result.name = '名稱過長，請縮短。'
  if (!category.value) result.category = '請選擇類別。'
  if (unitChoice.value === CUSTOM_UNIT && customUnitLimitExceeded.value) result.unit = '名稱過長，請縮短。'
  else if (unitChoice.value === CUSTOM_UNIT && duplicateCustomUnit.value) result.unit = '此單位已經存在'
  else if (!unit.value) result.unit = unitChoice.value === CUSTOM_UNIT ? '請輸入自訂單位。' : '請選擇單位。'
  return result
})
function updateName(event) {
  if (event.isComposing) return
  name.value = event.target.value
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
function togglePanel(panel) { if (editingUnits.value) return; openPanel.value = openPanel.value === panel ? null : panel }
function selectCategory(value) { category.value = value; openPanel.value = null }
async function selectUnit(value) {
  if (editingUnits.value) return
  unitChoice.value = value
  openPanel.value = value === CUSTOM_UNIT ? 'unit' : null
  if (value === CUSTOM_UNIT) { await nextTick(); customUnitField.value?.focus() }
}
function finishCustomUnit() {
  if (editingUnits.value || !customUnit.value.trim() || Array.from(customUnit.value.trim()).length > 4) return
  const result = unitOptions.addUnit(customUnit.value)
  if (!result.ok) { unitOptionError.value = result.message; return }
  unitChoice.value = result.value
  customUnit.value = ''
  unitOptionError.value = ''
  openPanel.value = null
  unitField.value?.querySelector('button')?.focus({ preventScroll: true })
}
function activateCustomUnit(value) {
  if (!editingUnits.value) return selectUnit(value)
  requestUnitDeletion(value)
}

// 保留既有放棄確認，圖片或手動圖示選擇也算有修改。
const isDirty = computed(() => !!(name.value.trim() || customCategoryName.value.trim() || category.value !== initialCategory || unitChoice.value || customUnit.value.trim() || iconManual.value || iconPhoto.value))
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
  if (editingUnits.value) return
  if (unitChoice.value === CUSTOM_UNIT) {
    const option = unitOptions.addUnit(customUnit.value)
    if (!option.ok) { unitOptionError.value = option.message; return }
    unitChoice.value = option.value
    customUnit.value = ''
  }
  submitting.value = true
  try {
    const created = catalog.addCatalogItem({ name: name.value.trim(), iconKey: iconKey.value,
      iconPhoto: iconPhoto.value, iconManual: iconManual.value, category: category.value, unit: unit.value })
    if (!created) { saveError.value = duplicateName.value ? '' : '無法新增用品，請確認欄位後再試一次。'; submitting.value = false; return }
    createdItemId.value = created.id
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
        <div class="name-row"><label for="item-name">名稱 <span class="required" aria-hidden="true">*</span></label><div class="name-field"><input id="item-name" ref="nameField" :value="name" :class="{ 'limit-exceeded': nameLimitExceeded }" type="text" required placeholder="輸入名稱" autocomplete="off" @focus="nameFocused = true" @blur="nameFocused = false" :aria-invalid="nameLimitExceeded || !!errors.name || duplicateName" :aria-describedby="nameLimitExceeded || errors.name ? 'item-name-error' : duplicateName ? 'name-duplicate' : undefined" @input="updateName" @compositionend="updateName" @keydown.enter="event => { if (!event.isComposing && event.keyCode !== 229) { event.preventDefault(); nameField.blur() } }" /><span v-if="nameFocused || nameLimitExceeded" class="name-count">{{ nameCountHint }}</span><p v-if="nameLimitExceeded || errors.name" id="item-name-error" class="field-hint" role="alert">{{ nameLimitExceeded ? '名稱過長，請縮短。' : errors.name }}</p></div></div>
        <p v-if="duplicateName" id="name-duplicate" class="duplicate-hint" role="alert">此用品已經存在</p>
      </div>
      <div ref="categoryField" class="field-section">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" aria-controls="category-options" :aria-describedby="errors.category ? 'item-category-error' : undefined" :aria-invalid="!!errors.category" @click="togglePanel('category')"><span class="selector-label">類別 <span class="required" aria-hidden="true">*</span></span><span class="selector-value" :class="{ 'selector-value--placeholder': !category }">{{ category || '請選擇' }}</span><img :src="selectorChevron" :class="{ expanded: openPanel === 'category' }" alt="" /></button>
        <p v-if="errors.category" id="item-category-error" class="field-hint field-hint--row" role="alert">{{ errors.category }}</p>
        <div v-if="openPanel === 'category'" id="category-options" class="inline-options">
          <div class="options-well unit-groups">
            <div class="unit-group"><span class="unit-group-label" id="preset-categories-title">預設</span><div class="pills" role="group" aria-labelledby="preset-categories-title"><button v-for="option in presetCategories" :key="option" type="button" class="pill" :class="{ selected: category === option }" :aria-pressed="category === option" @click="selectCategory(option)"><img v-if="category === option" :src="pillCheck" alt="" />{{ option }}</button></div></div>
            <div class="unit-group"><span class="unit-group-label" id="custom-categories-title">自訂</span><div class="pills" role="group" aria-labelledby="custom-categories-title"><button v-for="option in customCategories" :key="option" type="button" class="pill" :class="{ selected: category === option }" :aria-pressed="category === option" @click="selectCategory(option)"><img v-if="category === option" :src="pillCheck" alt="" />{{ option }}</button><button type="button" class="pill" :aria-expanded="addingCategory" aria-controls="custom-category-controls" @click="openCustomCategory">＋ 自訂分類</button></div></div>
          </div>
          <div v-if="addingCategory" id="custom-category-controls" class="custom-unit">
            <label for="custom-category">自訂分類 <span class="required" aria-hidden="true">*</span></label>
            <div class="custom-category-input-wrapper"><input id="custom-category" ref="customCategoryField" v-model="customCategoryName" type="text" required placeholder="輸入分類名稱" autocomplete="off" :class="{ 'limit-exceeded': customCategoryLimitExceeded || !!customCategoryMessage }" :aria-invalid="customCategoryLimitExceeded || !!customCategoryMessage" :aria-describedby="customCategoryMessage ? 'custom-category-error' : undefined" @focus="customCategoryFocused = true" @blur="customCategoryFocused = false" @input="customCategoryError = ''" @keydown.enter="event => { if (!event.isComposing && event.keyCode !== 229) { event.preventDefault(); finishCustomCategory() } }" />
              <span v-if="customCategoryFocused || customCategoryLimitExceeded" class="custom-category-count">{{ customCategoryCount }}</span>
              <p v-if="customCategoryMessage" id="custom-category-error" class="field-hint" role="alert">{{ customCategoryMessage }}</p>
            </div>
            <button type="button" class="pill custom-complete" :disabled="!canFinishCategory" @click="finishCustomCategory">完成</button>
          </div>
        </div>
      </div>
      <div ref="unitField" class="field-section">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" aria-controls="unit-options" :aria-describedby="errors.unit ? (duplicateCustomUnit || customUnitLimitExceeded ? 'unit-option-error' : 'item-unit-error') : undefined" :aria-invalid="!!errors.unit" @click="togglePanel('unit')"><span class="selector-label">單位 <span class="required" aria-hidden="true">*</span></span><span class="selector-value" :class="{ 'selector-value--placeholder': !unit }">{{ unit || '請選擇' }}</span><img :src="selectorChevron" :class="{ expanded: openPanel === 'unit' }" alt="" /></button>
        <p v-if="errors.unit && !duplicateCustomUnit && !customUnitLimitExceeded" id="item-unit-error" class="field-hint field-hint--row" role="alert">{{ errors.unit }}</p>
        <div v-if="openPanel === 'unit'" id="unit-options" class="inline-options">
          <div class="options-well unit-groups" :class="{ 'is-editing': editingUnits }">
            <div class="unit-group">
              <span class="unit-group-label" id="preset-units-title">預設</span>
              <div class="pills" role="group" aria-labelledby="preset-units-title"><button v-for="option in UNITS" :key="option" type="button" class="pill" :class="{ selected: !editingUnits && unitChoice === option }" :disabled="editingUnits" :aria-pressed="!editingUnits && unitChoice === option" @click="selectUnit(option)"><img v-if="!editingUnits && unitChoice === option" :src="pillCheck" alt="" />{{ option }}</button></div>
            </div>
            <div class="unit-group">
              <div class="unit-group-heading"><span class="unit-group-label" id="custom-units-title">自訂</span><button v-if="unitOptions.customUnits.length || editingUnits" type="button" class="unit-edit-button" :aria-pressed="editingUnits" @click="editingUnits = !editingUnits">{{ editingUnits ? '完成' : '編輯' }}</button></div>
              <div class="pills" role="group" aria-labelledby="custom-units-title">
                <button v-for="option in unitOptions.customUnits" :key="option" type="button" class="pill custom-unit-option" :class="{ selected: !editingUnits && unitChoice === option }" :aria-pressed="editingUnits ? undefined : unitChoice === option" :aria-label="editingUnits ? `刪除自訂單位${option}` : option" :aria-haspopup="editingUnits ? 'dialog' : undefined" @click="activateCustomUnit(option)">
                  <span v-if="editingUnits" class="unit-remove-mark" aria-hidden="true">×</span><img v-if="!editingUnits && unitChoice === option" :src="pillCheck" alt="" />{{ option }}
                </button>
                <button type="button" class="pill" :class="{ selected: !editingUnits && unitChoice === CUSTOM_UNIT }" :disabled="editingUnits" :aria-expanded="unitChoice === CUSTOM_UNIT" aria-controls="custom-unit-controls" @click="selectUnit(CUSTOM_UNIT)">＋ 自訂單位</button>
              </div>
            </div>
          </div>
          <div v-if="unitChoice === CUSTOM_UNIT" id="custom-unit-controls" class="custom-unit">
            <label for="custom-unit">自訂單位 <span class="required" aria-hidden="true">*</span></label>
            <div class="custom-unit-input-wrapper"><input id="custom-unit" ref="customUnitField" v-model="customUnit" :class="{ 'limit-exceeded': customUnitLimitExceeded }" @focus="customUnitFocused = true" @blur="customUnitFocused = false" type="text" required :disabled="editingUnits" placeholder="例如：盒、袋、罐" :aria-invalid="!!errors.unit || !!unitOptionMessage" :aria-describedby="unitOptionMessage ? 'unit-option-error' : undefined" @input="unitOptionError = ''" @keydown.enter="event => { if (!event.isComposing && event.keyCode !== 229) { event.preventDefault(); finishCustomUnit() } }" />
              <span v-if="customUnitFocused || customUnitLimitExceeded" class="custom-unit-count">{{ customUnitCount }}</span>
              <p v-if="unitOptionMessage" id="unit-option-error" class="field-hint" role="alert">{{ unitOptionMessage }}</p>
            </div>
            <button type="button" class="pill custom-complete" :disabled="!canFinishUnit" @click="finishCustomUnit">完成</button>
          </div>
          <p v-if="unitChoice !== CUSTOM_UNIT && unitOptionMessage" id="unit-option-error" class="field-hint" role="alert">{{ unitOptionMessage }}</p>
        </div>
      </div>
    </section>
    <p v-if="saveError" class="inline-hint" role="alert">{{ saveError }}</p>
    <div class="bottom-cta"><button type="submit" class="btn btn-primary create-button" :disabled="duplicateName || submitting">新增</button></div>
    <dialog ref="deleteUnitDialog" class="discard-dialog" aria-labelledby="delete-unit-title" aria-describedby="delete-unit-description" @cancel.prevent="cancelUnitDeletion" @close="pendingUnitDeletion = null">
      <h2 id="delete-unit-title">刪除「{{ pendingUnitDeletion }}」單位？</h2>
      <p id="delete-unit-description">僅從自訂單位選項移除，用品原本的單位與補貨紀錄不受影響。</p>
      <p v-if="unitOptionError" class="unit-delete-error" role="alert">{{ unitOptionError }}</p>
      <div class="discard-actions"><button type="button" class="discard-cancel" autofocus @click="cancelUnitDeletion">取消</button><button type="button" class="discard-confirm" @click="confirmUnitDeletion">刪除</button></div>
    </dialog>
    <AppToast :toast="unitToast" @undo="undoUnitRemoval" />
    <dialog ref="discardDialog" class="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-desc" @close="pendingRoute = null"><h2 id="discard-title">放棄新增？</h2><p id="discard-desc">你填寫的內容尚未建立，離開後將不會保留。</p><div class="discard-actions"><button type="button" class="discard-cancel" @click="discardDialog.close()">取消</button><button type="button" class="discard-confirm" @click="discard">放棄新增</button></div></dialog>
  </form>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.add-item-page { box-sizing: border-box; width: 100%; max-width: 358px; margin-inline: auto; min-height: calc(100svh - 167px); padding: t.$space-16 0 var(--keyboard-inset, 0px); display: flex; flex-direction: column; gap: t.$space-16; color: t.$text-main; font-family: t.$font-family; text-align: left; }
button { cursor: pointer; font-family: t.$font-family; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.app-bar { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; h1 { margin: 0; text-align: center; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; letter-spacing: .5px; } }
.back-button { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border: 0; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
.icon-preview { display: flex; justify-content: center; padding: t.$space-8 0 t.$space-16; }
.icon-circle { width: 80px; height: 80px; display: grid; place-items: center; border-radius: t.$radius-pill; background: t.$icon-circle-bg; box-shadow: inset -2.308px -2.308px 4.615px rgba(255,255,255,.9), inset 2.308px 2.308px 4.615px rgba(184,131,90,.22); overflow: hidden; img { width: 56px; height: 56px; } .item-photo { width: 100%; height: 100%; object-fit: cover; } }
.icon-error { margin: 0; color: t.$accent-text; text-align: center; font-size: t.$font-size-caption; }
.soft-card { border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; overflow: hidden; }
.field-section:not(:last-child)::after { content: ""; display: block; margin-inline: t.$space-16; border-bottom: 1px solid t.$border-color; }
.name-row, .selector-row { box-sizing: border-box; display: flex; width: 100%; min-height: 60px; padding: t.$space-12 t.$space-16; align-items: center; gap: t.$space-8; }
.name-row label, .selector-label { flex-shrink: 0; color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-body-sm} / 20px t.$font-family; }
.required { color: t.$danger; }
.field-hint { margin: t.$space-12 0 0; box-sizing: border-box; padding: t.$space-8 t.$space-12; border-radius: t.$radius-md; background: t.$accent-soft; color: t.$accent-text; font: t.$font-weight-regular #{t.$font-size-metadata} / normal t.$font-family; text-align: left; }
.field-hint--row { width: 196px; max-width: calc((100% - 32px) * .65); margin: 0 t.$space-16 t.$space-12 auto; }
.name-row { align-items: flex-start; }
.name-row label { flex: 1; display: flex; align-items: center; gap: t.$space-4; height: 36px; white-space: nowrap; }
.name-field { position: relative; width: 196px; max-width: 65%; min-width: 0; }
.name-count { position: absolute; right: t.$space-12; top: 18px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; white-space: nowrap; pointer-events: none; }
.name-row input { box-sizing: border-box; min-width: 0; max-width: 100%; width: 100%; height: 36px; padding: 0 52px 0 12px; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; text-align: left; font: t.$font-weight-regular 16px / 21px t.$font-family; &::placeholder { color: t.$text-disabled; } }
.name-row input.limit-exceeded { outline: 2px solid t.$accent-text; outline-offset: 2px; }
.selector-row { border: 0; background: transparent; text-align: left; img { width: 16px; height: 16px; flex-shrink: 0; transition: transform .3s ease; &.expanded { transform: rotate(-90deg); } } }
.selector-label { flex: 1; }
.selector-value { min-width: 0; overflow-wrap: anywhere; text-align: right; color: t.$text-main; font: t.$font-weight-medium #{t.$font-size-body-sm} / 20px t.$font-family; &.selector-value--placeholder { color: t.$text-disabled; font-weight: t.$font-weight-regular; } }
.inline-options { padding: 0 t.$space-16 t.$space-12; }
.options-well { padding: t.$space-12; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; }
.pill { display: inline-flex; align-items: center; gap: t.$space-4; padding: 6px t.$space-12; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-caption} / 18px t.$font-family; &.selected { padding-left: 10px; background: t.$active-green; color: t.$primary-green; font-weight: t.$font-weight-medium; box-shadow: t.$shadow-inset; } img { width: 14px; height: 14px; } }
.custom-unit { display: flex; align-items: flex-start; flex-wrap: wrap; gap: t.$space-8; margin-top: t.$space-16; label { display: flex; align-items: center; gap: t.$space-4; min-height: 48px; font-size: t.$font-size-caption; } input { box-sizing: border-box; min-width: 0; flex: 1; width: 120px; padding: t.$space-12; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: t.$font-weight-regular 16px / 22px t.$font-family; } }
.custom-complete { background: t.$primary-green; color: t.$text-inverse; &:disabled { background: t.$card-bg; color: t.$text-disabled; cursor: not-allowed; } }
.unit-groups { display: flex; flex-direction: column; gap: t.$space-16; }
.unit-group { display: flex; flex-direction: column; gap: t.$space-8; }
.unit-group-label { color: t.$text-sub; font-size: t.$font-size-caption; line-height: 18px; }
.unit-group-heading { display: flex; align-items: center; justify-content: space-between; min-height: 24px; }
.unit-edit-button { border: 0; padding: 2px 8px; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$primary-green; font: t.$font-weight-medium 12px / 20px t.$font-family; box-shadow: t.$shadow-raised; }
.custom-unit-option { gap: t.$space-4; }
.unit-remove-mark { display: inline-block; color: t.$accent-text; font: 14px / 1 t.$font-family; }
.unit-groups.is-editing button:disabled, .custom-unit input:disabled { color: t.$text-disabled; opacity: 1; cursor: not-allowed; }
.unit-groups.is-editing .pill:disabled { background: t.$card-bg; box-shadow: t.$shadow-raised; }
.discard-dialog .unit-delete-error { margin-top: t.$space-12; color: t.$accent-text; }
.custom-category-input-wrapper, .custom-unit-input-wrapper { position: relative; flex: 1; min-width: 0; width: 120px; }
.custom-unit .custom-category-input-wrapper input { width: 100%; height: 48px; padding-right: 52px; }
.custom-unit .custom-unit-input-wrapper input { width: 100%; height: 48px; padding-right: 52px; }
.custom-unit .custom-complete { margin-top: 9px; }
.custom-category-input-wrapper .field-hint, .custom-unit-input-wrapper .field-hint { width: 100%; }
.custom-category-count, .custom-unit-count { position: absolute; top: 24px; right: 14px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; pointer-events: none; }
.category-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.custom-unit input.limit-exceeded { outline: 2px solid t.$accent-text; outline-offset: 2px; }
.inline-hint { box-sizing: border-box; margin: 0 t.$space-16 t.$space-12; padding: t.$space-8 t.$space-12; border-radius: t.$radius-md; background: t.$accent-soft; color: t.$accent-text; font: t.$font-weight-regular #{t.$font-size-metadata} / normal t.$font-family; }
.duplicate-hint { margin: 0 t.$space-16 t.$space-12; color: t.$accent-text; font-size: t.$font-size-metadata; }
.bottom-cta { width: 100%; max-width: 314px; margin: auto auto 0; padding-top: t.$space-16; }
.create-button { width: 100%; min-height: 48px; border-radius: t.$radius-pill; font: t.$font-weight-bold 16px / 22px t.$font-family; &:disabled { background: t.$text-disabled; color: t.$text-inverse; border: 0; box-shadow: none; cursor: default; } }
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

// 手機隱藏導覽後，主要按鈕下緣對齊原導覽膠囊內的操作位置。
@media (max-width: 1023px) {
  .add-item-page { min-height: calc(100svh - max(44px, env(safe-area-inset-bottom))); }
}
</style>
