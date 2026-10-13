<script setup>
// 更換用品圖示（specs/008）：預設插槽放圖示圓圈，本元件加上相機角標、三選項 Bottom Sheet、
// 預設圖示選擇與相簿／拍照＋裁切。父層只要處理三個事件，再自行決定何時寫入。
import { ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import ImageCropDialog from './ImageCropDialog.vue'
import { getItemIcon } from '../assets/household-icons-by-state/index.js'
import { ITEM_STATUS } from '../models/item'
import { PRESET_ITEMS } from '../models/itemCategories'

const props = defineProps({
  iconKey: { type: String, default: null },
  iconPhoto: { type: String, default: null },
  // 預設圖示選擇器顯示的表情：新增用品為庫存充足（無追蹤），用品詳情為該用品目前狀態（ICO-03）。
  previewState: { type: String, default: ITEM_STATUS.IN_STOCK },
})
const emit = defineEmits(['select-preset', 'apply-photo', 'error'])

// 固定順序（5×2），名稱以 PRESET_ITEMS 為準。
const PICKER_ORDER = ['trash-bags', 'tissues', 'laundry-detergent', 'dish-soap', 'sponge', 'sanitary-pads', 'cotton-pads', 'rubbing-alcohol', 'light-bulb', 'dog-food']
const presets = PICKER_ORDER.map((key) => ({ key, name: PRESET_ITEMS.find((item) => item.iconKey === key)?.name ?? key }))

const sheetOpen = ref(false)
const view = ref('menu') // 'menu' | 'presets'
const albumInput = ref(null)
const cameraInput = ref(null)
const crop = ref(null)

function openSheet() {
  view.value = 'menu'
  sheetOpen.value = true
}
function choosePreset(key, close) {
  emit('select-preset', key)
  close()
}
// 選檔必須在點擊當下同步觸發，所以先 click input，再關閉 Sheet。
function pickImage(source, close) {
  (source === 'camera' ? cameraInput.value : albumInput.value)?.click()
  close()
}
function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) crop.value?.open(file)
}
</script>

<template>
  <button type="button" class="item-icon-edit" aria-label="更換用品圖示" @click="openSheet">
    <slot />
    <span class="item-icon-badge" aria-hidden="true"><i class="fa-regular fa-camera"></i></span>
  </button>

  <input ref="albumInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFileChange" />
  <input ref="cameraInput" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden @change="onFileChange" />

  <BottomSheet :open="sheetOpen" labelledby="item-icon-sheet-title" @close="sheetOpen = false">
    <template #default="{ close }">
      <template v-if="view === 'menu'">
        <h2 id="item-icon-sheet-title" class="sheet-title">更換用品圖示</h2>
        <p class="sheet-hint">可從我們準備的圖示中選擇，或使用自己的照片。</p>
        <div class="option-list">
          <button type="button" class="option-row" @click="view = 'presets'">
            <i class="fa-solid fa-table-cells-large" aria-hidden="true"></i><span>選擇預設圖示</span><i class="fa-solid fa-chevron-right chevron" aria-hidden="true"></i>
          </button>
          <button type="button" class="option-row" @click="pickImage('album', close)">
            <i class="fa-regular fa-image" aria-hidden="true"></i><span>從相簿選擇</span><i class="fa-solid fa-chevron-right chevron" aria-hidden="true"></i>
          </button>
          <button type="button" class="option-row" @click="pickImage('camera', close)">
            <i class="fa-regular fa-camera" aria-hidden="true"></i><span>拍照</span><i class="fa-solid fa-chevron-right chevron" aria-hidden="true"></i>
          </button>
        </div>
        <button type="button" class="btn btn-secondary sheet-cancel" @click="close">取消</button>
      </template>

      <template v-else>
        <div class="presets-header">
          <button type="button" class="presets-back" aria-label="返回" @click="view = 'menu'"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
          <h2 id="item-icon-sheet-title" class="sheet-title">選擇預設圖示</h2>
        </div>
        <p class="sheet-hint">點選圖示即可套用。</p>
        <div class="preset-grid">
          <button
            v-for="preset in presets"
            :key="preset.key"
            type="button"
            class="preset"
            :class="{ 'preset--selected': !props.iconPhoto && props.iconKey === preset.key }"
            :aria-pressed="!props.iconPhoto && props.iconKey === preset.key"
            @click="choosePreset(preset.key, close)"
          >
            <span class="preset-disc"><img :src="getItemIcon(preset.key, props.previewState)" alt="" /></span>
            <span class="preset-name">{{ preset.name }}</span>
          </button>
        </div>
      </template>
    </template>
  </BottomSheet>

  <ImageCropDialog ref="crop" @apply="emit('apply-photo', $event)" @error="emit('error', $event)" />
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

// 圖示圓圈＋右下角相機角標（Figma Icon Edit Badge / Camera：22px 深綠圓）。
.item-icon-edit {
  position: relative;
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.item-icon-badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: t.$primary-green;
  color: t.$text-inverse;
  font-size: 11px;
  box-shadow: 2px 3px 5px rgba(42, 74, 39, .35), -1.5px -1.5px 4px rgba(255, 255, 255, .9), inset -1px -1px 2px rgba(255, 255, 255, .22), inset 1px 1.5px 2px rgba(31, 58, 29, .28);
}

.sheet-title { margin: 0; font: t.$font-weight-bold 17px / 1.4 t.$font-family; }
.sheet-hint { margin: 4px 0 16px; color: t.$text-sub; font: t.$font-weight-regular 13px / 1.4 t.$font-family; }
.option-list { display: flex; flex-direction: column; gap: 10px; }
.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  border: 0;
  border-radius: 16px;
  background: t.$input-bg;
  color: t.$text-main;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  text-align: left;
  cursor: pointer;
  i { width: 20px; text-align: center; font-size: 17px; }
  span { flex: 1; }
  .chevron { width: auto; color: t.$text-disabled; font-size: 12px; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.sheet-cancel { width: 100%; height: 48px; margin-top: 16px; &:focus { outline: none; } }

.presets-header { display: flex; align-items: center; gap: 8px; }
.presets-back {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: t.$text-main;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: 50%; }
}
.preset-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px 6px; }
.preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: t.$text-sub;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: 12px; }
}
// 10 款統一底色（同新增用品圖示預覽），不用各款自己的彩色底（ICO-03）。
.preset-disc {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: t.$success-subtle;
  box-shadow: inset -3px -3px 6px rgba(255, 255, 255, .9), inset 3px 3px 6px rgba(184, 131, 90, .22);
  img { width: 48px; height: 48px; object-fit: contain; }
}
.preset-name { font: t.$font-weight-medium 11px / 1.3 t.$font-family; }
.preset--selected {
  .preset-disc { border-color: t.$primary-green; }
  .preset-name { color: t.$primary-green; font-weight: t.$font-weight-bold; }
}
</style>
