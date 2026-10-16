<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useCatalogStore } from '../../stores/catalog'
import { useItemsStore } from '../../stores/items'
import { UNITS, ITEM_STATUS, matchItemIconKey } from '../../models/item'
import { limitSpaceName } from '../../models/space'
import { getItemIconSrc } from '../../assets/household-icons-by-state'
import { isOtherCatalogNameTaken } from './globalItemPreview'
import ItemIconEditor from '../ItemIconEditor.vue'
import UnitChangeHint from './UnitChangeHint.vue'
import pillCheck from '../../assets/add-item/pill-check.svg'
import selectorChevron from '../../assets/add-item/selector-chevron.svg'
const props = defineProps({ open: Boolean, item: { type: Object, default: null } })
const emit = defineEmits(['close'])
const catalog = useCatalogStore()
const itemsStore = useItemsStore()
const dialog = ref(null)
const draft = ref({ name: '', category: '', unit: '' })
const CUSTOM_UNIT = 'custom'
const unitChoice = ref('')
const customUnit = ref('')
const unit = computed(() => unitChoice.value === CUSTOM_UNIT ? customUnit.value.trim() : unitChoice.value)
const openPanel = ref(null)
const iconError = ref('')
const deleteHint = ref(false)
const categoryOptions = computed(() => [...new Set([...itemsStore.categoryOptions, props.item?.category].filter(Boolean))])
const isPreset = computed(() => props.item?.id?.startsWith('preset:'))
const duplicate = computed(() => isOtherCatalogNameTaken(catalog.allItems, draft.value.name || '', props.item?.id))
const iconKey = computed(() => draft.value.iconManual || draft.value.name === props.item?.name
  ? draft.value.iconKey : matchItemIconKey(draft.value.name.trim()))
const iconSrc = computed(() => getItemIconSrc({ iconKey: iconKey.value, iconPhoto: draft.value.iconPhoto }, ITEM_STATUS.IN_STOCK))
const errors = computed(() => ({ name: !draft.value.name.trim(), category: !draft.value.category, unit: !unit.value }))
watch(() => props.open, async open => {
  if (!open) { dialog.value?.close(); return }
  draft.value = { ...props.item }
  unitChoice.value = UNITS.includes(props.item?.unit) ? props.item.unit : CUSTOM_UNIT
  customUnit.value = unitChoice.value === CUSTOM_UNIT ? props.item?.unit || '' : ''
  openPanel.value = null
  iconError.value = ''
  deleteHint.value = false
  await nextTick()
  if (!dialog.value?.open) dialog.value?.showModal()
})
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
function toggle(panel) { openPanel.value = openPanel.value === panel ? null : panel }
function chooseCategory(name) { draft.value.category = name; openPanel.value = null }
function chooseUnit(value) { unitChoice.value = value; openPanel.value = value === CUSTOM_UNIT ? 'unit' : null }
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="global-editor" aria-labelledby="global-editor-title" @cancel.prevent="emit('close')" @close="emit('close')">
      <form novalidate @submit.prevent>
        <h2 id="global-editor-title">編輯全域用品</h2>
        <p class="mode" id="editor-save-status">編輯預覽：儲存尚未開放，修改不會套用到用品或補貨紀錄。</p>
        <div class="icon-preview"><ItemIconEditor :icon-key="iconKey" :icon-photo="draft.iconPhoto" @select-preset="selectIcon" @apply-photo="applyPhoto" @error="iconError = $event"><span class="icon-circle"><img :src="iconSrc" :class="{ photo: draft.iconPhoto }" alt="" /></span></ItemIconEditor></div>
        <p v-if="iconError" class="error" role="alert">{{ iconError }}</p>
        <div class="form-card">
          <div class="field-section">
            <div class="name-row"><label for="global-name" :class="{ invalid: errors.name }">名稱 <span class="required" aria-hidden="true">*</span></label><input id="global-name" :value="draft.name" required placeholder="請輸入" :aria-invalid="errors.name || duplicate" :aria-describedby="duplicate ? 'global-duplicate' : undefined" @input="updateName" @compositionend="updateName" /></div>
            <p v-if="duplicate" id="global-duplicate" class="duplicate" role="alert">此用品已經存在</p>
          </div>
          <div class="field-section">
            <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" aria-controls="global-categories" :aria-invalid="errors.category" @click="toggle('category')"><span :class="{ invalid: errors.category }">類別 <span class="required" aria-hidden="true">*</span></span><strong>{{ draft.category || '請選擇' }}</strong><img :src="selectorChevron" :class="{ expanded: openPanel === 'category' }" alt="" /></button>
            <div v-if="openPanel === 'category'" id="global-categories" class="pills" role="group" aria-label="類別"><button v-for="name in categoryOptions" :key="name" type="button" class="pill" :aria-pressed="draft.category === name" @click="chooseCategory(name)"><img v-if="draft.category === name" :src="pillCheck" alt="" />{{ name }}</button></div>
          </div>
          <div class="field-section">
            <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" aria-controls="global-units" :aria-invalid="errors.unit" @click="toggle('unit')"><span :class="{ invalid: errors.unit }">單位 <span class="required" aria-hidden="true">*</span></span><strong>{{ unit || '請選擇' }}</strong><img :src="selectorChevron" :class="{ expanded: openPanel === 'unit' }" alt="" /></button>
            <div v-if="openPanel === 'unit'" id="global-units"><div class="pills" role="group" aria-label="單位"><button v-for="option in [...UNITS, CUSTOM_UNIT]" :key="option" type="button" class="pill" :aria-pressed="unitChoice === option" @click="chooseUnit(option)"><img v-if="unitChoice === option" :src="pillCheck" alt="" />{{ option === CUSTOM_UNIT ? '自訂單位' : option }}</button></div><div v-if="unitChoice === CUSTOM_UNIT" class="custom-unit"><label for="global-unit" class="visually-hidden">自訂單位</label><input id="global-unit" v-model="customUnit" required maxlength="4" placeholder="例如：盒、袋、罐" :aria-invalid="errors.unit" /><button type="button" class="pill" @click="unit && (openPanel = null)">完成</button></div></div>
          </div>
        </div>
        <UnitChangeHint :old-unit="item?.unit || ''" :new-unit="unit" :has-history="null" />
        <template v-if="item && !isPreset"><button type="button" class="delete-preview" @click="deleteHint = true">刪除用品</button><p v-if="deleteHint" class="mode" role="status">刪除功能尚未開放，用品不會被刪除。</p></template>
        <div class="actions"><button type="button" class="btn btn-secondary" @click="emit('close')">取消</button><button type="submit" class="btn btn-primary" disabled aria-describedby="editor-save-status">儲存（尚未開放）</button></div>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.global-editor { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; box-sizing: border-box; margin: auto; padding: t.$space-24; border: 0; border-radius: t.$radius-card; background: t.$bg-main; box-shadow: t.$shadow-card; color: t.$text-main; font: t.$font-weight-regular #{t.$font-size-body-sm} / 1.5 t.$font-family; &::backdrop { background: rgba(t.$text-main, .35); } }
h2 { margin: 0 0 t.$space-8; font-size: t.$font-size-card-title; text-align: center; }
.mode { margin: t.$space-8 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; }
.icon-preview { display: flex; justify-content: center; margin: t.$space-24 0; }
.icon-circle { display: grid; place-items: center; width: 80px; height: 80px; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; overflow: hidden; img { width: 56px; height: 56px; } .photo { width: 100%; height: 100%; object-fit: cover; } }
.form-card { overflow: hidden; background: t.$card-bg; border-radius: t.$radius-card; box-shadow: t.$shadow-card; }
.field-section:not(:last-child) { border-bottom: 1px solid t.$border-color; }
.required, .invalid { color: t.$danger; }
.name-row, .selector-row { box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: t.$space-8; min-height: 60px; padding: t.$space-12 t.$space-16; color: t.$text-body; }
.name-row label { flex-shrink: 0; }
.name-row input { min-width: 0; width: 100%; flex: 1; border: 0; padding: 0; background: transparent; text-align: right; color: t.$text-main; font: t.$font-weight-regular 16px / 22px t.$font-family; &::placeholder { color: t.$text-disabled; } }
.selector-row { border: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; strong { margin-left: auto; min-width: 0; overflow-wrap: anywhere; font-weight: t.$font-weight-medium; color: t.$text-main; } img { width: 16px; height: 16px; flex-shrink: 0; &.expanded { transform: rotate(-90deg); } } }
.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; padding: 0 t.$space-16 t.$space-16; }
.pill { display: inline-flex; align-items: center; gap: t.$space-4; border: 0; padding: t.$space-8 t.$space-12; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$text-body; box-shadow: t.$shadow-raised; font: t.$font-weight-regular #{t.$font-size-caption} / 18px t.$font-family; cursor: pointer; &[aria-pressed=true] { background: t.$primary-soft; color: t.$primary-green; box-shadow: t.$shadow-inset; } img { width: 14px; height: 14px; } }
.custom-unit { display: flex; gap: t.$space-8; padding: 0 t.$space-16 t.$space-16; input { min-width: 0; width: 100%; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; padding: t.$space-12; font: t.$font-weight-regular 16px / 22px t.$font-family; } }
.error, .duplicate { margin: 0 t.$space-16 t.$space-12; color: t.$accent-text; font-size: t.$font-size-caption; }
.actions { display: flex; gap: t.$space-12; margin-top: t.$space-16; .btn { flex: 1; min-height: t.$button-height; border-radius: t.$radius-pill; font-size: t.$font-size-body-sm; } .btn:disabled { background: t.$text-disabled; box-shadow: none; color: t.$text-inverse; cursor: default; } }
.delete-preview { border: 0; padding: t.$space-8; margin-top: t.$space-16; background: transparent; color: t.$danger; font: inherit; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
