<script setup>
// 用品詳情「基本資訊」（specs/003 FR-303）：所屬空間、分類、補貨單位。
// 點列在下方展開，選取即通知父層儲存並收合；選項與樣式同新增用品頁（specs/002）。
import { computed, ref, watch } from 'vue'
import { CATEGORIES, UNITS } from '../../models/item'
import AddSpaceSheet from '../add-item/AddSpaceSheet.vue'
import selectorChevron from '../../assets/add-item/selector-chevron.svg'
import pillCheck from '../../assets/add-item/pill-check.svg'
import spaceCheck from '../../assets/add-item/space-check.svg'

const CUSTOM_UNIT = 'custom'

const props = defineProps({
  item: { type: Object, required: true },
  spaces: { type: Array, required: true },
})
// change：(欄位, 新值)，欄位為 'spaceId' | 'category' | 'unit'。
const emit = defineEmits(['change'])

const openPanel = ref(null) // 'space' | 'category' | 'unit'；同一時間只展開一個
const addSpaceOpen = ref(false)
const customSelected = ref(false)
const customUnit = ref('')

const spaceName = computed(() => props.spaces.find((space) => space.id === props.item.spaceId)?.name ?? '未指定空間')
const isCustomUnit = computed(() => !!props.item.unit && !UNITS.includes(props.item.unit))

// 展開單位時，自訂單位帶入目前值。
watch(openPanel, (panel) => {
  if (panel !== 'unit') return
  customSelected.value = isCustomUnit.value
  customUnit.value = isCustomUnit.value ? props.item.unit : ''
})

function togglePanel(panel) {
  openPanel.value = openPanel.value === panel ? null : panel
}

function select(field, value) {
  openPanel.value = null
  if (props.item[field] !== value) emit('change', field, value)
}

function saveCustomUnit() {
  const value = customUnit.value.trim()
  if (value) select('unit', value)
}

function onSpaceCreated(space) {
  select('spaceId', space.id)
}
</script>

<template>
  <section class="detail-section" aria-labelledby="basic-info-title">
    <h2 id="basic-info-title" class="section-title">基本資訊</h2>
    <div class="list-card">
      <!-- 所屬空間 -->
      <div class="list-row">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'space'" @click="togglePanel('space')">
          <span class="selector-label">所屬空間</span>
          <span class="selector-value">{{ spaceName }}</span>
          <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'space' }" :src="selectorChevron" alt="" />
        </button>
        <div v-if="openPanel === 'space'" class="inline-options">
          <div class="options-well space-options" role="group" aria-label="所屬空間">
            <button
              v-for="space in spaces"
              :key="space.id"
              type="button"
              class="space-option"
              :class="{ 'space-option--selected': item.spaceId === space.id }"
              :aria-pressed="item.spaceId === space.id"
              @click="select('spaceId', space.id)"
            >
              <span>{{ space.name }}</span>
              <img v-if="item.spaceId === space.id" :src="spaceCheck" alt="" />
            </button>
            <button type="button" class="space-add" @click="addSpaceOpen = true">
              <span class="plus-icon" aria-hidden="true" />新增空間
            </button>
          </div>
        </div>
      </div>

      <!-- 分類 -->
      <div class="list-row">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" @click="togglePanel('category')">
          <span class="selector-label">分類</span>
          <span class="selector-value" :class="{ 'selector-value--placeholder': !item.category }">{{ item.category ?? '選擇分類' }}</span>
          <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'category' }" :src="selectorChevron" alt="" />
        </button>
        <div v-if="openPanel === 'category'" class="inline-options">
          <div class="options-well pills" role="group" aria-label="分類">
            <button
              v-for="option in CATEGORIES"
              :key="option"
              type="button"
              class="pill"
              :class="{ 'pill--selected': item.category === option }"
              :aria-pressed="item.category === option"
              @click="select('category', option)"
            ><img v-if="item.category === option" :src="pillCheck" alt="" />{{ option }}</button>
          </div>
        </div>
      </div>

      <!-- 補貨單位 -->
      <div class="list-row">
        <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" @click="togglePanel('unit')">
          <span class="selector-label">補貨單位</span>
          <span class="selector-value">{{ item.unit }}</span>
          <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'unit' }" :src="selectorChevron" alt="" />
        </button>
        <div v-if="openPanel === 'unit'" class="inline-options">
          <div class="options-well pills" role="group" aria-label="補貨單位">
            <button
              v-for="option in UNITS"
              :key="option"
              type="button"
              class="pill"
              :class="{ 'pill--selected': !customSelected && item.unit === option }"
              :aria-pressed="!customSelected && item.unit === option"
              @click="customSelected = false; select('unit', option)"
            ><img v-if="!customSelected && item.unit === option" :src="pillCheck" alt="" />{{ option }}</button>
            <button
              type="button"
              class="pill"
              :class="{ 'pill--selected': customSelected }"
              :aria-pressed="customSelected"
              @click="customSelected = true"
            ><img v-if="customSelected" :src="pillCheck" alt="" />自訂單位</button>
          </div>
          <div v-if="customSelected" class="custom-unit">
            <label for="detail-custom-unit">自訂單位</label>
            <input
              id="detail-custom-unit"
              v-model="customUnit"
              type="text"
              maxlength="4"
              placeholder="例如：盒、袋、罐"
              autocomplete="off"
              @keydown.enter.prevent="saveCustomUnit"
              @blur="saveCustomUnit"
            />
          </div>
          <p class="options-helper">只影響數量顯示，不會改變補貨日期</p>
        </div>
      </div>
    </div>
    <AddSpaceSheet :open="addSpaceOpen" @close="addSpaceOpen = false" @created="onSpaceCreated" />
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
@use './section' as section;

.pills { display: flex; flex-wrap: wrap; gap: t.$space-8; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: t.$space-4;
  padding: 6px 12px;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-body;
  font: t.$font-weight-regular 13px / 18px t.$font-family;
  white-space: nowrap;
  img { display: block; }
  &--selected {
    padding-left: 10px;
    background: t.$active-green;
    box-shadow: t.$shadow-inset;
    color: t.$primary-green;
    font-weight: t.$font-weight-medium;
  }
}
.selector-row {
  width: 100%;
  min-height: 48px;
  padding: t.$space-12 t.$space-16;
  display: flex;
  align-items: center;
  gap: t.$space-8;
  border: 0;
  background: transparent;
  text-align: left;
}
.selector-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 15px / normal t.$font-family; }
.selector-value {
  color: t.$text-main;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  &--placeholder { color: t.$text-disabled; font-weight: t.$font-weight-regular; }
}
.selector-chevron { flex-shrink: 0; transition: transform .3s ease; &--open { transform: rotate(-90deg); } }
.inline-options { padding: 0 t.$space-16 t.$space-12; display: flex; flex-direction: column; gap: 10px; }
.options-well { padding: t.$space-12; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.options-helper { margin: 0; color: #8b8880; font: t.$font-weight-regular 12px / normal t.$font-family; }
.custom-unit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  label { color: t.$text-body; font: t.$font-weight-medium 13px / normal t.$font-family; }
  input {
    padding: 12px t.$space-16;
    border: 1.5px solid transparent;
    border-radius: t.$radius-input;
    background: t.$input-bg;
    box-shadow: t.$shadow-inset;
    color: t.$text-main;
    font: t.$font-weight-regular 15px / normal t.$font-family;
    &::placeholder { color: t.$text-disabled; }
    &:focus { outline: none; border-color: t.$primary-green; }
  }
}
.space-options { display: flex; flex-direction: column; gap: 2px; }
.space-option {
  height: 40px;
  padding: 0 t.$space-12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 14px / 20px t.$font-family;
  &--selected { background: t.$active-green; box-shadow: t.$shadow-inset; color: t.$primary-green; font-weight: t.$font-weight-medium; }
}
.space-add {
  height: 36px;
  padding: 0 t.$space-12;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: t.$text-sub;
  font: t.$font-weight-regular 13px / 18px t.$font-family;
}
.plus-icon {
  position: relative;
  width: 12px;
  height: 12px;
  &::before, &::after { content: ''; position: absolute; border-radius: 1px; background: currentColor; }
  &::before { inset: 43.75% 12.5%; }
  &::after { inset: 12.5% 43.75%; }
}
@media (prefers-reduced-motion: reduce) { .selector-chevron { transition: none; } }
</style>
