<script setup>
import { computed, ref, watch, nextTick, inject } from 'vue'
import { useUnitOptionsStore } from '../../stores/unitOptions'
import { PRESET_ITEMS, SYSTEM_CATEGORIES } from '../../models/itemCategories'
import { useCatalogStore } from '../../stores/catalog'
import { useItemsStore } from '../../stores/items'
import { UNITS, ITEM_STATUS } from '../../models/item'
import { formatNameCount, limitSpaceName } from '../../models/space'
import { getItemIconSrc } from '../../assets/household-icons-by-state'
import { isOtherCatalogNameTaken } from './globalItemPreview'
import ItemIconEditor from '../ItemIconEditor.vue'
import BottomSheet from '../BottomSheet.vue'
import UnitChangeHint from './UnitChangeHint.vue'
import AppToast from '../AppToast.vue'
import { useToast } from '../../composables/useToast'
import { useUnitManagement } from '../../composables/useUnitManagement'
import pillCheck from '../../assets/add-item/pill-check.svg'
import selectorChevron from '../../assets/add-item/selector-chevron.svg'
const props = defineProps({ open: Boolean, item: { type: Object, default: null } })
const emit = defineEmits(['close'])
const catalog = useCatalogStore()
const itemsStore = useItemsStore()
const appToast = inject('appToast', null)
const { toast: saveFailureToast, showToast: showFailureToast, hideToast: hideFailureToast } = useToast()
const unitOptions = useUnitOptionsStore()
const { editingUnits, unitOptionError, deleteUnitDialog, pendingUnitDeletion, unitToast,
  undoUnitRemoval, requestUnitDeletion, cancelUnitDeletion, confirmUnitDeletion } = useUnitManagement()
const dialog = ref(null)
const draft = ref({ name: '', category: '', unit: '' })
const CUSTOM_UNIT = 'custom'
const unitChoice = ref('')
const customUnit = ref('')
const customUnitField = ref(null)
const unit = computed(() => unitChoice.value === CUSTOM_UNIT ? customUnit.value.trim() : unitChoice.value)
const openPanel = ref(null)
const nameFocused = ref(false)
const iconError = ref('')
const deleteDialog = ref(null)
const operationError = ref('')
const saving = ref(false)
const linkedSpaceCount = computed(() => new Set(itemsStore.items.filter(item => item.catalogId === props.item?.id).map(item => item.spaceId)).size)
const confirmedChanges = ref(null)
const unitConfirmationDialog = ref(null)
watch(() => !!confirmedChanges.value, async open => {
  await nextTick()
  const dialog = unitConfirmationDialog.value
  if (open && confirmedChanges.value && dialog && !dialog.open) dialog.showModal()
  else if (!confirmedChanges.value && dialog?.open) dialog.close()
})
const unitChanged = computed(() => !!props.item && unit.value !== props.item.unit)
const hasHistory = computed(() => !!props.item && itemsStore.items.some(item => item.catalogId === props.item.id && item.restockRecords?.length > 0))
const canSave = computed(() => !saving.value && !editingUnits.value && !duplicate.value && !Object.values(errors.value).some(Boolean))
const categoryOptions = computed(() => [...new Set([...itemsStore.categoryOptions, props.item?.category].filter(Boolean))])
const categoryGroups = computed(() => [
  { title: '預設', options: categoryOptions.value.filter(name => SYSTEM_CATEGORIES.includes(name)) },
  { title: '自訂', options: categoryOptions.value.filter(name => !SYSTEM_CATEGORIES.includes(name)) },
])
const unitGroups = computed(() => [
  { title: '預設', options: UNITS },
  { title: '自訂', options: [...new Set([...unitOptions.customUnits, ...(!UNITS.includes(props.item?.unit) && props.item?.unit ? [props.item.unit] : [])]), CUSTOM_UNIT] },
])
const isPreset = computed(() => props.item?.id?.startsWith('preset:'))
const duplicate = computed(() => isOtherCatalogNameTaken(catalog.allItems, draft.value.name || '', props.item?.id))
const iconKey = computed(() => draft.value.iconKey)
const iconSrc = computed(() => getItemIconSrc({ iconKey: iconKey.value, iconPhoto: draft.value.iconPhoto }, ITEM_STATUS.IN_STOCK))
const errors = computed(() => ({ name: !draft.value.name.trim(), category: !draft.value.category,
  unit: !unit.value || (unitChoice.value === CUSTOM_UNIT && (Array.from(customUnit.value.trim()).length > 4 || unitOptions.isNameTaken(customUnit.value))) }))
watch(() => props.open, async open => {
  if (!open) { hideFailureToast(); cancelUnitChange(); cancelUnitDeletion(); return }
  editingUnits.value = false
  cancelUnitDeletion()
  draft.value = { ...props.item }
  unitChoice.value = props.item?.unit || ''
  customUnit.value = unitChoice.value === CUSTOM_UNIT ? props.item?.unit || '' : ''
  openPanel.value = null
  iconError.value = ''
  operationError.value = ''
  saving.value = false
  await nextTick()

})
function restoreDefaults() {
  const preset = PRESET_ITEMS.find(item => `preset:${item.iconKey}` === props.item?.id)
  draft.value = preset ? { ...props.item, ...preset, iconPhoto: null, iconManual: false } : { ...props.item }
  unitChoice.value = draft.value.unit || ''
  customUnit.value = ''
  openPanel.value = null
  editingUnits.value = false
  cancelUnitDeletion()
  operationError.value = ''
  iconError.value = ''
}
function updateName(event) {
  if (event.isComposing) return
  const value = limitSpaceName(event.target.value)
  event.target.value = value
  draft.value.name = value
}
function selectIcon(key) {
  Object.assign(draft.value, { iconKey: key, iconPhoto: null, iconManual: true })
  iconError.value = ''
}
function applyPhoto(dataUrl) {
  Object.assign(draft.value, { iconKey: iconKey.value, iconPhoto: dataUrl, iconManual: true })
  iconError.value = ''
}
function animateOptions(element, done, opening) {
  if (!element.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { done(); return }
  const height = `${element.scrollHeight}px`
  element.style.overflow = 'hidden'
  const animation = element.animate([
    { height: opening ? '0px' : height, opacity: opening ? 0 : 1 },
    { height: opening ? height : '0px', opacity: opening ? 1 : 0 },
  ], { duration: 280, easing: 'ease-in-out' })
  const finish = () => {
    element.style.overflow = ''
    done()
    if (opening) nextTick(() => {
      const focused = document.activeElement
      if (element.contains(focused) && focused?.matches('input')) {
        focused.closest('.custom-unit')?.scrollIntoView({ block: 'nearest' })
      }
    })
  }
  animation.onfinish = finish
  animation.oncancel = finish
}
function enterOptions(element, done) { animateOptions(element, done, true) }
function leaveOptions(element, done) { animateOptions(element, done, false) }
function toggle(panel) { if (editingUnits.value) return; openPanel.value = openPanel.value === panel ? null : panel }
function chooseCategory(name) { draft.value.category = name; openPanel.value = null }
async function chooseUnit(value) {
  if (editingUnits.value) return
  unitChoice.value = value
  unitOptionError.value = ''
  openPanel.value = value === CUSTOM_UNIT ? 'unit' : null
  if (value === CUSTOM_UNIT) {
    await nextTick()
    customUnitField.value?.focus({ preventScroll: true })
    customUnitField.value?.closest('.custom-unit')?.scrollIntoView({ block: 'nearest' })
  }
}
const canFinishUnit = computed(() => !editingUnits.value && !!customUnit.value.trim()
  && Array.from(customUnit.value.trim()).length <= 4 && !unitOptions.isNameTaken(customUnit.value))
const customUnitMessage = computed(() => Array.from(customUnit.value.trim()).length > 4 ? '名稱過長，請縮短。'
  : customUnit.value.trim() && unitOptions.isNameTaken(customUnit.value) ? '此單位已經存在' : unitOptionError.value)
function finishCustomUnit() {
  if (!canFinishUnit.value) return
  const result = unitOptions.addUnit(customUnit.value)
  if (!result.ok) { unitOptionError.value = result.message; return }
  unitChoice.value = result.value
  customUnit.value = ''
  unitOptionError.value = ''
  openPanel.value = null
}
function showSaveFailure(message) {
  operationError.value = message
  showFailureToast(message, null, '復原', 'error')
}
function save() {
  if (!canSave.value) return
  if (unitChoice.value === CUSTOM_UNIT) {
    finishCustomUnit()
    if (unitChoice.value === CUSTOM_UNIT) return
  }
  if (unitChanged.value) {
    const current = catalog.getById(props.item.id)
    if (!current || current.unit !== props.item.unit) { operationError.value = '用品已變更，請重新開啟編輯。'; return }
    operationError.value = ''
    confirmedChanges.value = { oldUnit: current.unit, newUnit: unit.value }

    return
  }
  commitEdit(false)
}
function cancelUnitChange() { confirmedChanges.value = null; hideFailureToast() }
function confirmUnitChange() {
  if (!confirmedChanges.value || confirmedChanges.value.oldUnit !== catalog.getById(props.item.id)?.unit || confirmedChanges.value.newUnit !== unit.value) {
    cancelUnitChange()
    operationError.value = '用品已變更，請重新確認單位。'
    return
  }
  if (!canSave.value) return
  if (commitEdit(true)) cancelUnitChange()
}
function commitEdit(confirmUnitChange) {
  saving.value = true
  let result
  try {
    result = catalog.updateCatalogItem(props.item.id, { name: draft.value.name.trim(), category: draft.value.category,
    unit: unit.value, iconKey: iconKey.value, iconPhoto: draft.value.iconPhoto ?? null, iconManual: draft.value.iconManual ?? false }, { confirmUnitChange, expectedUnit: confirmUnitChange ? confirmedChanges.value?.oldUnit : undefined })
  } catch (error) {
    console.error('[GlobalItemEditor] 儲存編輯失敗', error)
    showSaveFailure('儲存失敗，請稍後再試。')
    return false
  } finally { saving.value = false }
  if (!result.ok) { showSaveFailure(result.error.code === 'NAME_TAKEN' ? '此用品已經存在' : result.error.message); return false }
  appToast?.showToast('已成功儲存編輯')
  emit('close')
  return true
}
function remove() {
  const result = catalog.removeCatalogItem(props.item.id)
  if (!result.ok) { operationError.value = result.error.message; deleteDialog.value?.close(); return }
  deleteDialog.value?.close()
  emit('close')
}
</script>
<template>
  <Teleport to="body">
    <BottomSheet :open="open" labelledby="global-editor-title" @close="emit('close')">
    <div class="global-editor item-editor">
      <form novalidate @submit.prevent="save">
        <AppToast v-if="!confirmedChanges" :toast="saveFailureToast" :teleport-disabled="true" />
        <AppToast :toast="unitToast" :teleport-disabled="true" @undo="undoUnitRemoval" />
        <header class="editor-heading"><h2 id="global-editor-title">{{ item?.name }}</h2><button type="button" class="restore-defaults" @click="restoreDefaults">還原預設</button></header>
        <div class="icon-preview"><ItemIconEditor :icon-key="iconKey" :icon-photo="draft.iconPhoto" @select-preset="selectIcon" @apply-photo="applyPhoto" @error="iconError = $event"><span class="icon-circle"><img :src="iconSrc" :class="{ photo: draft.iconPhoto }" alt="" /></span></ItemIconEditor></div>
        <p v-if="iconError" class="error" role="alert">{{ iconError }}</p>
        <div class="form-card">
          <div class="field-section">
            <div class="name-row"><label for="global-name" >名稱 <span class="required" aria-hidden="true">*</span></label><div class="name-field"><input id="global-name" :value="draft.name" required placeholder="輸入名稱" @focus="nameFocused = true" @blur="nameFocused = false" :aria-invalid="errors.name || duplicate" :aria-describedby="duplicate ? 'global-duplicate' : undefined" @input="updateName" @compositionend="updateName" /><span v-if="nameFocused" class="name-count">{{ formatNameCount(draft.name) }}</span></div></div>
            <p v-if="duplicate" id="global-duplicate" class="duplicate" role="alert">此用品已經存在</p>
          </div>
          <div class="field-section">
            <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" aria-controls="global-categories" :aria-invalid="errors.category" @click="toggle('category')"><span >類別 <span class="required" aria-hidden="true">*</span></span><strong>{{ draft.category || '請選擇' }}</strong><img :src="selectorChevron" :class="{ expanded: openPanel === 'category' }" alt="" /></button>
            <Transition :css="false" @enter="enterOptions" @leave="leaveOptions">
            <div v-if="openPanel === 'category'" id="global-categories" class="options-well"><section v-for="group in categoryGroups" :key="group.title" class="option-group"><h3>{{ group.title }}</h3><div class="pills" role="group" :aria-label="`${group.title}類別`"><button v-for="name in group.options" :key="name" type="button" class="pill" :aria-pressed="draft.category === name" @click="chooseCategory(name)"><img v-if="draft.category === name" :src="pillCheck" alt="" />{{ name }}</button></div></section></div>
            </Transition>
          </div>
          <div class="field-section">
            <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" aria-controls="global-units" :aria-invalid="errors.unit" @click="toggle('unit')"><span >單位 <span class="required" aria-hidden="true">*</span></span><strong>{{ unit || '請選擇' }}</strong><img :src="selectorChevron" :class="{ expanded: openPanel === 'unit' }" alt="" /></button>
            <Transition :css="false" @enter="enterOptions" @leave="leaveOptions">
            <div v-if="openPanel === 'unit'" id="global-units"><div class="options-well"><section v-for="group in unitGroups" :key="group.title" class="option-group"><div class="unit-heading"><h3>{{ group.title }}</h3><button v-if="group.title === '自訂' && (unitOptions.customUnits.length || editingUnits)" type="button" class="unit-edit-button" @click="editingUnits = !editingUnits">{{ editingUnits ? '完成' : '編輯' }}</button></div><div class="pills" role="group" :aria-label="`${group.title}單位`"><button v-for="option in group.options" :key="option" type="button" class="pill" :disabled="editingUnits && !unitOptions.customUnits.includes(option)" :aria-pressed="!editingUnits && unitChoice === option" @click="editingUnits ? requestUnitDeletion(option) : chooseUnit(option)"><span v-if="editingUnits && unitOptions.customUnits.includes(option)" aria-hidden="true">×</span><img v-if="!editingUnits && unitChoice === option" :src="pillCheck" alt="" />{{ option === CUSTOM_UNIT ? '＋ 自訂單位' : option }}</button></div></section></div><div v-if="unitChoice === CUSTOM_UNIT" class="custom-unit"><label for="global-unit" class="visually-hidden">自訂單位</label><input id="global-unit" ref="customUnitField" v-model="customUnit" @input="unitOptionError = ''" :disabled="editingUnits" required placeholder="例如：盒、袋、罐" :aria-invalid="!!customUnitMessage" /><button type="button" class="pill" :disabled="!canFinishUnit" @click="finishCustomUnit">完成</button></div><p v-if="customUnitMessage" class="unit-validation" role="alert">{{ customUnitMessage }}</p></div>
            </Transition>
          </div>
        </div>
        <UnitChangeHint :old-unit="item?.unit || ''" :new-unit="unit" :has-history="hasHistory" />
        <p v-if="operationError" class="error" role="alert">{{ operationError }}</p>
        <div class="actions"><button type="button" class="btn btn-secondary" @click="emit('close')">取消</button><button type="submit" class="btn btn-primary" :disabled="!canSave">儲存</button></div>
      </form>
    </div>
    </BottomSheet>
    <dialog ref="unitConfirmationDialog" class="global-editor unit-confirmation-dialog" aria-labelledby="unit-confirmation-title" aria-describedby="unit-confirmation-description" @cancel.prevent="cancelUnitChange" @close="cancelUnitChange">
      <div class="unit-confirmation">
        <h2 id="unit-confirmation-title">確認修改單位？</h2>
        <p id="unit-confirmation-description">舊紀錄保留「{{ confirmedChanges?.oldUnit }}」，改用「{{ confirmedChanges?.newUnit }}」後重新計算補貨時間。</p>
        <p v-if="linkedSpaceCount > 1">這次修改會同步影響 {{ linkedSpaceCount }} 個空間的此用品，各空間會分別建立新的補貨計算週期。</p>
        <p v-if="operationError" class="error" role="alert">{{ operationError }}</p>
        <AppToast :toast="saveFailureToast" :teleport-disabled="true" />
        <div class="actions"><button type="button" class="btn btn-secondary" :disabled="saving" @click="cancelUnitChange">取消</button><button type="button" class="btn btn-primary" :disabled="saving" @click="confirmUnitChange">確認修改</button></div>
      </div>
    </dialog>
    <dialog ref="deleteUnitDialog" class="global-editor" aria-labelledby="editor-unit-delete-title" @cancel.prevent="cancelUnitDeletion" @close="pendingUnitDeletion = null">
      <h2 id="editor-unit-delete-title">刪除「{{ pendingUnitDeletion }}」單位？</h2>
      <p>僅從自訂單位選項移除，用品原本的單位與補貨紀錄不受影響。</p>
      <p v-if="unitOptionError" class="error" role="alert">{{ unitOptionError }}</p>
      <div class="actions"><button type="button" class="btn btn-secondary" @click="cancelUnitDeletion">取消</button><button type="button" class="btn btn-danger" @click="confirmUnitDeletion">刪除</button></div>
    </dialog>
    <dialog ref="deleteDialog" class="global-editor" aria-labelledby="global-delete-title">
      <h2 id="global-delete-title">刪除全域用品？</h2><p>僅移除「{{ item?.name }}」的全域選項，各空間用品、購買清單與補貨歷史均保留。</p>
      <div class="actions"><button type="button" class="btn btn-secondary" @click="deleteDialog.close()">取消</button><button type="button" class="btn btn-danger" @click="remove">刪除</button></div>
    </dialog>
  </Teleport>
</template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.global-editor { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; box-sizing: border-box; margin: auto; padding: t.$space-24; border: 0; border-radius: t.$radius-card; background: t.$bg-main; box-shadow: t.$shadow-card; color: t.$text-main; font: t.$font-weight-regular #{t.$font-size-body-sm} / 1.5 t.$font-family; &::backdrop { background: rgba(t.$text-main, .35); } }
:global(.bottom-sheet:has(.item-editor)) { background: t.$bg-main; }
.item-editor { width: calc(100% + 32px); max-height: calc(90dvh - 90px); height: auto; margin: 0 -16px; padding: 16px; border-radius: 0; background: transparent; box-shadow: none; overflow-y: auto; overscroll-behavior: contain; }
.item-editor > form { display: flex; flex-direction: column; }

.editor-heading { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr) 76px; align-items: center; gap: t.$space-4; h2 { grid-column: 2; margin: 0; text-align: center; overflow-wrap: anywhere; } .restore-defaults { grid-column: 3; justify-self: end; } }
.restore-defaults { flex-shrink: 0; padding: 4px 8px; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$primary-green; box-shadow: t.$shadow-raised; font: t.$font-weight-medium 12px / 20px t.$font-family; }
.item-editor > form > .actions { margin-top: t.$space-16; padding-top: 0; }
h2 { margin: 0 0 t.$space-8; font-size: t.$font-size-card-title; text-align: center; }
.mode { margin: t.$space-8 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; }
.icon-preview { display: flex; justify-content: center; margin: t.$space-24 0; }
.icon-circle { display: grid; place-items: center; width: 80px; height: 80px; border-radius: t.$radius-pill; background: t.$icon-circle-bg; box-shadow: inset -2.308px -2.308px 4.615px rgba(255,255,255,.9), inset 2.308px 2.308px 4.615px rgba(184,131,90,.22); overflow: hidden; img { width: 56px; height: 56px; } .photo { width: 100%; height: 100%; object-fit: cover; } }
.form-card { flex-shrink: 0; overflow: hidden; background: t.$card-bg; border-radius: t.$radius-card; box-shadow: t.$shadow-card; }
.field-section:not(:last-child)::after { content: ""; display: block; margin-inline: t.$space-16; border-bottom: 1px solid t.$border-color; }
.required, .invalid { color: t.$danger; }
.name-row, .selector-row { box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: t.$space-8; min-height: 60px; padding: t.$space-12 t.$space-16; color: t.$text-body; }
.name-row { align-items: flex-start; }
.name-row label { flex: 1; display: flex; align-items: center; gap: t.$space-4; height: 36px; white-space: nowrap; }
.name-field { position: relative; width: 196px; max-width: 65%; min-width: 0; }
.name-count { position: absolute; right: t.$space-12; top: 18px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; pointer-events: none; }
.name-row input { box-sizing: border-box; min-width: 0; width: 100%; height: 36px; padding: 0 52px 0 12px; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; text-align: left; color: t.$text-main; font: t.$font-weight-regular 16px / 21px t.$font-family; &::placeholder { color: t.$text-disabled; } }
.selector-row { border: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; strong { margin-left: auto; min-width: 0; overflow-wrap: anywhere; font-weight: t.$font-weight-medium; color: t.$text-main; } img { width: 16px; height: 16px; flex-shrink: 0; &.expanded { transform: rotate(-90deg); } } }
.options-well { margin: 0 t.$space-16 t.$space-12; padding: t.$space-12; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.unit-confirmation-dialog { width: min(320px, calc(100vw - 32px)); }
.unit-confirmation p { margin: 0; overflow-wrap: anywhere; }
.unit-confirmation p + p { margin-top: t.$space-8; }
.unit-validation { margin: 8px 16px 12px; padding: 8px 12px; border-radius: t.$radius-md; background: t.$accent-soft; color: t.$accent-text; font-size: 13px; }
.unit-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: t.$space-8; h3 { margin: 0; } }
.unit-edit-button { border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; color: t.$primary-green; font: inherit; font-size: 12px; padding: 2px 8px; }
.pill:disabled { color: t.$text-disabled; cursor: default; }
.option-group + .option-group { margin-top: t.$space-16; }
.option-group h3 { margin: 0 0 t.$space-8; color: t.$text-sub; font: t.$font-weight-regular 12px / 20px t.$font-family; }
.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; }
.pill { display: inline-flex; align-items: center; gap: t.$space-4; border: 0; padding: 6px t.$space-12; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$text-body; box-shadow: t.$shadow-raised; font: t.$font-weight-regular #{t.$font-size-caption} / 18px t.$font-family; cursor: pointer; &[aria-pressed=true] { padding-left: 10px; background: t.$active-green; color: t.$primary-green; font-weight: t.$font-weight-medium; box-shadow: t.$shadow-inset; } img { width: 14px; height: 14px; } }
.custom-unit { display: flex; gap: t.$space-8; > .pill { flex-shrink: 0; white-space: nowrap; } padding: 0 t.$space-16 t.$space-16; input { min-width: 0; flex: 1; width: 0; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; padding: t.$space-12; font: t.$font-weight-regular 16px / 22px t.$font-family; } }
.error, .duplicate { margin: 0 t.$space-16 t.$space-12; color: t.$accent-text; font-size: t.$font-size-caption; }
.actions { display: flex; gap: t.$space-12; margin-top: t.$space-16; .btn { flex: 1; min-height: t.$button-height; border-radius: t.$radius-pill; font-size: t.$font-size-body-sm; } .btn:disabled { background: t.$text-disabled; box-shadow: none; color: t.$text-inverse; cursor: default; } }
.delete-preview { border: 0; padding: t.$space-8; margin-top: t.$space-16; background: transparent; color: t.$danger; font: inherit; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
