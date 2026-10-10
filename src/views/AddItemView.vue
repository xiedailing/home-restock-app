<script setup>
// 新增用品頁（specs/002-add-item）。Figma：[Current] 新增用品 / Mobile / Soft UI（1098:8897）。
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import {
  CATEGORIES,
  COMMON_ITEM_GROUPS,
  DEFAULT_SPACE_ID,
  ITEM_STATUS,
  UNITS,
  addDays,
  addMonths,
  calcDaysPerUnit,
  matchItemIconKey,
  toDateString,
} from '../models/item'
import { limitSpaceName } from '../models/space'
import { getItemIcon } from '../assets/household-icons-by-state/index.js'
import DatePickerSheet from '../components/add-item/DatePickerSheet.vue'
import AddSpaceSheet from '../components/add-item/AddSpaceSheet.vue'
import SwitchTrack from '../components/SwitchTrack.vue'
import backIcon from '../assets/add-item/back-chevron.svg'
import expandIcon from '../assets/add-item/expand-chevron.svg'
import selectorChevron from '../assets/add-item/selector-chevron.svg'
import pillCheck from '../assets/add-item/pill-check.svg'
import spaceCheck from '../assets/add-item/space-check.svg'
import reminderIcon from '../assets/add-item/reminder.svg'
import calendarIcon from '../assets/add-item/calendar.svg'
import dateChevron from '../assets/add-item/date-chevron.svg'
import toastCheck from '../assets/settings/toast-check.svg'

const CUSTOM_UNIT = 'custom'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const { spaces, inventorySpaceId } = storeToRefs(itemsStore)

const today = toDateString()
const initialSpaceId = spaces.value.some((space) => space.id === route.query.space) ? route.query.space : DEFAULT_SPACE_ID

const name = ref('')
const category = ref(null)
const unitChoice = ref(null) // UNITS 其中之一，或 CUSTOM_UNIT
const customUnit = ref('')
const spaceId = ref(initialSpaceId)
const reminderEnabled = ref(true)
const quantity = ref(1)
const nextRestockDate = ref(null)

const commonOpen = ref(false)
const openPanel = ref(null) // 'category' | 'unit' | 'space'；同一時間只展開一個
const datePickerOpen = ref(false)
const addSpaceOpen = ref(false)

const unit = computed(() => (unitChoice.value === CUSTOM_UNIT ? customUnit.value.trim() : unitChoice.value ?? ''))
const iconSrc = computed(() => getItemIcon(matchItemIconKey(name.value.trim()), ITEM_STATUS.IN_STOCK))
const selectedSpaceName = computed(() => spaces.value.find((space) => space.id === spaceId.value)?.name ?? '')
const selectedCommonName = computed(() => {
  const trimmed = name.value.trim()
  return COMMON_ITEM_GROUPS.some((group) => group.items.some((item) => item.name === trimmed)) ? trimmed : null
})

function togglePanel(panel) {
  openPanel.value = openPanel.value === panel ? null : panel
}

// 選常用用品：覆蓋名稱、分類（即所在分組）、單位；不動數量與日期。
function applyCommonItem(item, itemCategory) {
  name.value = item.name
  category.value = itemCategory
  unitChoice.value = item.unit
  customUnit.value = ''
}

// 名稱長度規則同空間名稱：中文算 2、英數算 1，上限 16；組字期間不截斷。
function updateName(event) {
  if (event.isComposing) return
  const limited = limitSpaceName(event.target.value)
  if (limited !== event.target.value) event.target.value = limited
  name.value = limited
}

function selectCategory(value) {
  category.value = value
  openPanel.value = null
}

// 選一般單位後收合；選自訂單位保持展開，讓使用者輸入。
function selectUnit(value) {
  unitChoice.value = value
  if (value !== CUSTOM_UNIT) openPanel.value = null
}

function selectSpace(id) {
  spaceId.value = id
  openPanel.value = null
}

// ---------- 預計補貨日 ----------
const minDate = addDays(today, 1)
const quickDates = [
  { label: '下週', date: addDays(today, 7) },
  { label: '兩週後', date: addDays(today, 14) },
  { label: '下個月', date: addMonths(today, 1) },
]
const formattedDate = computed(() => nextRestockDate.value?.replaceAll('-', '/') ?? '')

// ---------- 驗證 ----------
const submitted = ref(false)
const errors = computed(() => {
  if (!submitted.value) return {}
  const result = {}
  if (!name.value.trim()) result.name = '請輸入用品名稱。'
  if (!category.value) result.category = '請選擇分類，方便之後篩選用品。'
  if (!unitChoice.value) result.unit = '請選擇補貨單位。'
  else if (unitChoice.value === CUSTOM_UNIT && !customUnit.value.trim()) result.customUnit = '請輸入自訂單位。'
  if (reminderEnabled.value && !nextRestockDate.value) result.date = '請選擇下一次預計補貨日。'
  return result
})

const fieldRefs = { name: ref(null), category: ref(null), unit: ref(null), customUnit: ref(null), date: ref(null) }
const nameField = fieldRefs.name
const categoryField = fieldRefs.category
const unitField = fieldRefs.unit
const customUnitField = fieldRefs.customUnit
const dateField = fieldRefs.date

// ---------- 返回與放棄 ----------
const initialSnapshot = JSON.stringify({ name: '', category: null, unitChoice: null, customUnit: '', spaceId: initialSpaceId, reminderEnabled: true, quantity: 1, nextRestockDate: null })
const isDirty = computed(() => JSON.stringify({
  name: name.value.trim(), category: category.value, unitChoice: unitChoice.value, customUnit: customUnit.value.trim(),
  spaceId: spaceId.value, reminderEnabled: reminderEnabled.value, quantity: quantity.value, nextRestockDate: nextRestockDate.value,
}) !== initialSnapshot)

const discardDialog = ref(null)
let allowLeave = false
let pendingRoute = null

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'inventory' })
}

onBeforeRouteLeave((to) => {
  if (allowLeave || !isDirty.value) return true
  pendingRoute = to
  discardDialog.value?.showModal()
  return false
})

function discard() {
  allowLeave = true
  discardDialog.value?.close()
  const target = pendingRoute
  pendingRoute = null
  // 由返回鍵觸發時退回上一頁，避免在瀏覽紀錄留下重複的頁面。
  if (target && target.fullPath === window.history.state?.back) router.back()
  else if (target) router.push(target)
  else goBack()
}

// ---------- 新增空間 ----------
const spaceToastVisible = ref(false)
let spaceToastTimer
function onSpaceCreated(space) {
  spaceId.value = space.id
  openPanel.value = null
  clearTimeout(spaceToastTimer)
  spaceToastVisible.value = true
  spaceToastTimer = setTimeout(() => { spaceToastVisible.value = false }, 3000)
}

// ---------- 建立 ----------
async function createItem() {
  submitted.value = true
  const firstError = ['name', 'category', 'unit', 'customUnit', 'date'].find((key) => errors.value[key])
  if (firstError) {
    if (firstError === 'customUnit') openPanel.value = 'unit'
    await nextTick()
    fieldRefs[firstError].value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  const reminder = reminderEnabled.value
  const item = itemsStore.addItem({
    name: name.value.trim(),
    iconKey: matchItemIconKey(name.value.trim()),
    category: category.value,
    unit: unit.value,
    spaceId: spaceId.value,
    reminderEnabled: reminder,
    nextRestockDate: reminder ? nextRestockDate.value : null,
    // 001 FR-002：每單位可撐天數 ＝（預計補貨日 − 基準日）÷ 庫存量，保留小數。
    reminderBaseDate: reminder ? today : null,
    reminderBaseQuantity: reminder ? quantity.value : null,
    daysPerUnit: reminder ? calcDaysPerUnit(nextRestockDate.value, today, quantity.value) : null,
    reminderEnabledDate: reminder ? today : null,
  })

  // 我的用品篩選其他空間時切到新用品的空間；「所有用品」維持。
  if (inventorySpaceId.value !== null && inventorySpaceId.value !== item.spaceId) inventorySpaceId.value = item.spaceId
  allowLeave = true
  // 建立後進入用品詳情（Figma Flow 01；取代暫行的 ADD-06）。用 replace，返回時不回到新增頁。
  router.replace({ name: 'item-detail', params: { id: item.id }, query: { created: '1' } })
}
</script>

<template>
  <form class="add-item-page" novalidate @submit.prevent="createItem">
    <header class="app-bar">
      <button type="button" class="back-button" aria-label="返回" @click="goBack">
        <img :src="backIcon" alt="" />
      </button>
      <h1>新增用品</h1>
      <span aria-hidden="true" />
    </header>

    <!-- 常用用品 -->
    <section class="soft-card common-card">
      <button type="button" class="common-header" :aria-expanded="commonOpen" aria-controls="common-items" @click="commonOpen = !commonOpen">
        <span class="common-text">
          <strong>常用用品</strong>
          <span>{{ commonOpen ? '選擇後會自動帶入名稱、分類與單位。' : '快速帶入名稱、分類與單位' }}</span>
        </span>
        <img class="expand-icon" :class="{ 'expand-icon--open': commonOpen }" :src="expandIcon" alt="" />
      </button>
      <div v-if="commonOpen" id="common-items" class="common-scroll">
        <div v-for="group in COMMON_ITEM_GROUPS" :key="group.category" class="common-group" role="group" :aria-label="group.category">
          <p>{{ group.category }}</p>
          <div class="pills">
            <button
              v-for="item in group.items"
              :key="item.name"
              type="button"
              class="pill"
              :class="{ 'pill--selected': selectedCommonName === item.name }"
              :aria-pressed="selectedCommonName === item.name"
              @click="applyCommonItem(item, group.category)"
            >
              <img v-if="selectedCommonName === item.name" :src="pillCheck" alt="" />{{ item.name }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 基本資訊 -->
    <section class="form-section" aria-labelledby="basic-info-title">
      <h2 id="basic-info-title" class="section-title">基本資訊 <span class="required">*</span></h2>
      <div class="soft-card list-card">
        <div class="icon-preview">
          <span class="icon-circle"><img :src="iconSrc" alt="" /></span>
        </div>

        <div ref="nameField" class="name-row">
          <div class="name-content">
            <label for="item-name">用品名稱</label>
            <input
              id="item-name"
              :value="name"
              type="text"
              placeholder="例如：洗衣精、衛生紙、牙膏"
              autocomplete="off"
              :aria-invalid="!!errors.name"
              :aria-describedby="errors.name ? 'name-hint' : undefined"
              @input="updateName"
              @compositionend="updateName"
            />
          </div>
          <span class="row-divider row-divider--flush" />
        </div>
        <p v-if="errors.name" id="name-hint" class="inline-hint">{{ errors.name }}</p>

        <!-- 分類 -->
        <div ref="categoryField">
          <button type="button" class="selector-row" :aria-expanded="openPanel === 'category'" @click="togglePanel('category')">
            <span class="selector-label">分類</span>
            <span class="selector-value" :class="{ 'selector-value--placeholder': !category }">{{ category ?? '選擇分類' }}</span>
            <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'category' }" :src="selectorChevron" alt="" />
          </button>
          <div v-if="openPanel === 'category'" class="inline-options">
            <div class="options-well pills" role="group" aria-label="分類">
              <button
                v-for="option in CATEGORIES"
                :key="option"
                type="button"
                class="pill"
                :class="{ 'pill--selected': category === option }"
                :aria-pressed="category === option"
                @click="selectCategory(option)"
              ><img v-if="category === option" :src="pillCheck" alt="" />{{ option }}</button>
            </div>
          </div>
          <p v-if="errors.category" class="inline-hint">{{ errors.category }}</p>
          <span class="row-divider" />
        </div>

        <!-- 補貨單位 -->
        <div ref="unitField">
          <button type="button" class="selector-row" :aria-expanded="openPanel === 'unit'" @click="togglePanel('unit')">
            <span class="selector-label">補貨單位</span>
            <span class="selector-value" :class="{ 'selector-value--placeholder': !unit }">{{ unit || '請選擇單位' }}</span>
            <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'unit' }" :src="selectorChevron" alt="" />
          </button>
          <div v-if="openPanel === 'unit'" class="inline-options">
            <div class="options-well pills" role="group" aria-label="補貨單位">
              <button
                v-for="option in [...UNITS, CUSTOM_UNIT]"
                :key="option"
                type="button"
                class="pill"
                :class="{ 'pill--selected': unitChoice === option }"
                :aria-pressed="unitChoice === option"
                @click="selectUnit(option)"
              ><img v-if="unitChoice === option" :src="pillCheck" alt="" />{{ option === CUSTOM_UNIT ? '自訂單位' : option }}</button>
            </div>
            <div v-if="unitChoice === CUSTOM_UNIT" ref="customUnitField" class="custom-unit">
              <label for="custom-unit">自訂單位</label>
              <input
                id="custom-unit"
                v-model="customUnit"
                type="text"
                maxlength="4"
                placeholder="例如：盒、袋、罐"
                autocomplete="off"
                :aria-invalid="!!errors.customUnit"
                @keydown.enter.prevent="customUnit.trim() && (openPanel = null)"
              />
              <p v-if="errors.customUnit" class="inline-hint inline-hint--nested">{{ errors.customUnit }}</p>
            </div>
            <p class="options-helper">用於之後記錄「已補貨 1 瓶」這類資訊</p>
          </div>
          <p v-if="errors.unit" class="inline-hint">{{ errors.unit }}</p>
          <span class="row-divider" />
        </div>

        <!-- 所屬空間 -->
        <div>
          <button type="button" class="selector-row" :aria-expanded="openPanel === 'space'" @click="togglePanel('space')">
            <span class="selector-label">所屬空間</span>
            <span class="selector-value">{{ selectedSpaceName }}</span>
            <img class="selector-chevron" :class="{ 'selector-chevron--open': openPanel === 'space' }" :src="selectorChevron" alt="" />
          </button>
          <div v-if="openPanel === 'space'" class="inline-options">
            <div class="options-well space-options" role="group" aria-label="所屬空間">
              <button
                v-for="space in spaces"
                :key="space.id"
                type="button"
                class="space-option"
                :class="{ 'space-option--selected': spaceId === space.id }"
                :aria-pressed="spaceId === space.id"
                @click="selectSpace(space.id)"
              >
                <span>{{ space.name }}</span>
                <img v-if="spaceId === space.id" :src="spaceCheck" alt="" />
              </button>
              <button type="button" class="space-add" @click="addSpaceOpen = true">
                <span class="plus-icon" aria-hidden="true" />新增空間
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 補貨提醒 -->
    <section class="form-section" aria-labelledby="reminder-title">
      <h2 id="reminder-title" class="section-title">補貨提醒</h2>
      <div class="soft-card reminder-card" :class="{ 'reminder-card--on': reminderEnabled }">
        <div class="reminder-header">
          <img class="reminder-icon" :src="reminderIcon" alt="" />
          <div class="reminder-text">
            <strong id="reminder-switch-label">設定補貨提醒</strong>
            <span>系統會在接近需要補貨時提醒你。</span>
          </div>
          <button type="button" class="reminder-switch" role="switch" :aria-checked="reminderEnabled" aria-labelledby="reminder-switch-label" @click="reminderEnabled = !reminderEnabled">
            <SwitchTrack :checked="reminderEnabled" />
          </button>
        </div>

        <template v-if="reminderEnabled">
          <div class="question-group">
            <p class="question" id="quantity-label">家裡目前有多少？</p>
            <div class="stepper" role="group" aria-labelledby="quantity-label">
              <button type="button" class="stepper-button" aria-label="減少數量" :disabled="quantity <= 1" @click="quantity -= 1">
                <span class="stepper-h" />
              </button>
              <p class="stepper-value" aria-live="polite"><strong>{{ quantity }}</strong><span v-if="unit">{{ unit }}</span></p>
              <button type="button" class="stepper-button" aria-label="增加數量" @click="quantity += 1">
                <span class="stepper-h" /><span class="stepper-v" />
              </button>
            </div>
          </div>

          <div ref="dateField" class="question-group">
            <div class="question-text">
              <p class="question">下一次預計什麼時候補貨？ <span class="required">*</span></p>
              <p class="question-helper">不需要很精準，只是先幫你把補貨需求留下來。</p>
            </div>
            <div class="date-well">
              <div class="pills" role="group" aria-label="快速選擇預計補貨日">
                <button
                  v-for="option in quickDates"
                  :key="option.label"
                  type="button"
                  class="pill"
                  :class="{ 'pill--selected': nextRestockDate === option.date }"
                  :aria-pressed="nextRestockDate === option.date"
                  @click="nextRestockDate = option.date"
                ><img v-if="nextRestockDate === option.date" :src="pillCheck" alt="" />{{ option.label }}</button>
              </div>
              <div class="date-row">
                <span class="date-label" id="date-row-label">預計補貨日</span>
                <button type="button" class="date-pill" aria-labelledby="date-row-label" :aria-describedby="errors.date ? 'date-hint' : undefined" @click="datePickerOpen = true">
                  <img :src="calendarIcon" alt="" />
                  <span :class="{ 'date-placeholder': !nextRestockDate }">{{ formattedDate || '選擇日期' }}</span>
                  <img :src="dateChevron" alt="" />
                </button>
              </div>
            </div>
            <p v-if="errors.date" id="date-hint" class="inline-hint inline-hint--nested">{{ errors.date }}</p>
          </div>
        </template>
        <p v-else class="off-note">暫不設定也沒關係，之後可以在用品詳情頁再設定。</p>
      </div>
    </section>

    <div class="bottom-cta">
      <button type="submit" class="btn btn-primary create-button">建立用品</button>
    </div>

    <DatePickerSheet v-model="nextRestockDate" :open="datePickerOpen" :min-date="minDate" @close="datePickerOpen = false" />
    <AddSpaceSheet :open="addSpaceOpen" @close="addSpaceOpen = false" @created="onSpaceCreated" />

    <!-- 放棄新增確認；樣式同我的用品刪除確認。 -->
    <dialog ref="discardDialog" class="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-desc" @close="pendingRoute = null">
      <h2 id="discard-title">放棄新增？</h2>
      <p id="discard-desc">你填寫的內容尚未建立，離開後將不會保留。</p>
      <div class="discard-actions">
        <button type="button" class="discard-cancel" @click="discardDialog.close()">取消</button>
        <button type="button" class="discard-confirm" @click="discard">放棄新增</button>
      </div>
    </dialog>

    <Teleport to="body">
      <Transition name="space-toast">
        <div v-if="spaceToastVisible" class="space-toast" role="status">
          <img :src="toastCheck" alt="" />已成功新增空間
        </div>
      </Transition>
    </Teleport>
  </form>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

$inset-s: inset -3px -3px 10px rgba(255, 255, 255, .65), inset 2px 3px 6px rgba(105, 99, 85, .16);
$caption-color: #8b8880;

.add-item-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  // 底部 CTA 固定高 110px（含手勢區 34px）；App 已預留 34px。
  padding: t.$space-16 0 92px;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  color: t.$text-main;
  font-family: t.$font-family;
  text-align: left;
}
button { cursor: pointer; font-family: t.$font-family; }
button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }

// ---------- App Bar ----------
.app-bar {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: t.$font-weight-bold #{t.$font-size-app-bar}/#{t.$line-height-app-bar} t.$font-family; }
}
.back-button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 22px;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  img { display: block; }
}

// ---------- 共用 ----------
.soft-card { background: t.$card-bg; box-shadow: t.$shadow-card; overflow: hidden; }
.form-section { display: flex; flex-direction: column; gap: t.$space-8; }
.section-title { margin: 0; padding: 0 t.$space-4; font: t.$font-weight-bold 16px / 22px t.$font-family; }
.required { color: t.$accent-text; }
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
    box-shadow: $inset-s;
    color: t.$primary-green;
    font-weight: t.$font-weight-medium;
  }
}
.inline-hint {
  margin: 0 t.$space-16 t.$space-12;
  padding: t.$space-8 t.$space-12;
  border-radius: t.$radius-md;
  background: t.$accent-soft;
  color: t.$accent-text;
  font: t.$font-weight-regular 13px / normal t.$font-family;
  &--nested { margin: 0; }
}

// ---------- 常用用品 ----------
.common-card { border-radius: t.$radius-popover; }
.common-header {
  width: 100%;
  padding: t.$space-16;
  display: flex;
  align-items: center;
  gap: t.$space-12;
  border: 0;
  background: transparent;
  text-align: left;
}
.common-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  strong { color: t.$text-main; font: t.$font-weight-bold 16px / normal t.$font-family; }
  span { color: $caption-color; font: t.$font-weight-regular 13px / normal t.$font-family; }
}
.expand-icon { flex-shrink: 0; transition: transform .3s ease; &--open { transform: rotate(180deg); } }
.common-scroll {
  height: 176px;
  padding: 0 t.$space-16 t.$space-16;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #c6c1b4 #ece9e1;
  // 底部淡出，提示還有內容可捲動。
  mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent);
}
.common-group {
  display: flex;
  flex-direction: column;
  gap: t.$space-8;
  p { margin: 0; color: t.$text-body; font: t.$font-weight-medium 13px / normal t.$font-family; }
}

// ---------- 基本資訊 ----------
.list-card { padding: t.$space-4 0; border-radius: t.$space-24; }
.icon-preview { padding: t.$space-16 0 t.$space-4; display: flex; justify-content: center; }
.icon-circle {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: t.$success-subtle;
  box-shadow: inset -3.692px -3.692px 7.385px rgba(255, 255, 255, .9), inset 3.692px 3.692px 7.385px rgba(184, 131, 90, .22);
  img { width: 48px; height: 48px; }
}
.name-row { padding-left: t.$space-16; }
.name-content {
  padding: t.$space-8 t.$space-16 t.$space-8 0;
  display: flex;
  align-items: center;
  gap: t.$space-12;
  label { flex-shrink: 0; color: t.$text-body; font: t.$font-weight-regular 14px / 20px t.$font-family; }
  input {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 t.$space-12;
    border: 0;
    border-radius: t.$radius-input;
    background: t.$input-bg;
    box-shadow: $inset-s;
    color: t.$text-main;
    font: t.$font-weight-regular 15px / 21px t.$font-family;
    &::placeholder { color: t.$text-disabled; }
  }
}
.name-row + .inline-hint { margin-top: t.$space-12; }
.row-divider { display: block; height: 1px; margin: 0 t.$space-16; background: t.$border-color; &--flush { margin: 0; } }
.selector-row {
  width: 100%;
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
.options-well { padding: t.$space-12; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: $inset-s; }
.options-helper { margin: 0; color: $caption-color; font: t.$font-weight-regular 12px / normal t.$font-family; }
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
    box-shadow: $inset-s;
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
  &--selected { background: t.$active-green; box-shadow: $inset-s; color: t.$primary-green; font-weight: t.$font-weight-medium; }
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
// Figma Icon / Plus：12px，橫豎線各佔 25%～75%。
.plus-icon {
  position: relative;
  width: 12px;
  height: 12px;
  &::before, &::after { content: ''; position: absolute; border-radius: 1px; background: currentColor; }
  &::before { inset: 43.75% 12.5%; }
  &::after { inset: 12.5% 43.75%; }
}

// ---------- 補貨提醒 ----------
.reminder-card {
  padding: t.$space-20;
  display: flex;
  flex-direction: column;
  gap: t.$space-12;
  border: 1px solid transparent;
  border-radius: t.$radius-card;
  &--on { gap: 18px; border-color: #b8d1af; }
}
.reminder-header { display: flex; align-items: center; gap: t.$space-12; }
.reminder-icon { flex-shrink: 0; }
.reminder-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: t.$space-4;
  strong { font: t.$font-weight-bold 18px / normal t.$font-family; }
  span { color: t.$text-body; font: t.$font-weight-regular 14px / normal t.$font-family; }
}
.reminder-switch {
  flex: 0 0 t.$switch-width;
  height: t.$switch-height;
  padding: 0;
  border: 0;
  border-radius: t.$switch-radius;
  background: transparent;
}
.off-note { margin: 0; color: $caption-color; font: t.$font-weight-regular 13px / normal t.$font-family; }
.question-group { display: flex; flex-direction: column; gap: 10px; }
.question-text { display: flex; flex-direction: column; gap: 2px; }
.question { margin: 0; font: t.$font-weight-bold 15px / normal t.$font-family; }
.question-helper { margin: 0; color: $caption-color; font: t.$font-weight-regular 12px / normal t.$font-family; }
.stepper {
  height: 64px;
  padding: t.$space-12;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: $inset-s;
}
.stepper-button {
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  &:disabled { opacity: .4; cursor: default; .stepper-h { opacity: .2; } }
}
// Figma Icon / Minus、Plus：16px 內 H 與 V 兩條 2px 線。
.stepper-h, .stepper-v { position: absolute; border-radius: 1px; background: t.$primary-green; }
.stepper-h { left: 14px; right: 14px; top: 19px; height: 2px; }
.stepper-v { top: 14px; bottom: 14px; left: 19px; width: 2px; }
.stepper-value {
  margin: 0;
  display: flex;
  align-items: flex-end;
  gap: t.$space-4;
  strong { font: t.$font-weight-bold 28px / normal t.$font-family; }
  span { color: $caption-color; font: t.$font-weight-medium 15px / normal t.$font-family; padding-bottom: 3px; }
}
.date-well {
  padding: t.$space-12;
  display: flex;
  flex-direction: column;
  gap: t.$space-4;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: $inset-s;
}
.date-row {
  padding: t.$space-8 t.$space-16 t.$space-8 t.$space-16;
  display: flex;
  align-items: center;
  gap: t.$space-12;
}
.date-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 14px / 20px t.$font-family; }
.date-pill {
  height: 36px;
  padding: 0 t.$space-12 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: t.$radius-input;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-main;
  font: t.$font-weight-medium 14px / 20px t.$font-family;
  white-space: nowrap;
  img { display: block; }
}
.date-placeholder { color: t.$text-disabled; font-weight: t.$font-weight-regular; }

// ---------- 底部 CTA ----------
.bottom-cta {
  position: fixed;
  inset: auto 0 0;
  z-index: 10;
  padding: 28px t.$space-16 34px;
  display: flex;
  justify-content: center;
  background: linear-gradient(to bottom, rgba(239, 235, 227, 0), t.$bg-main 35%);
}
.create-button {
  width: 100%;
  max-width: 358px;
  min-height: t.$button-height;
  font: t.$font-weight-bold t.$font-size-button / normal t.$font-family;
}

// ---------- 放棄新增 Dialog（同 InventoryView .delete-dialog）----------
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

// ---------- 新增空間 Toast（同設定頁 .created-space-toast）----------
.space-toast {
  position: fixed;
  bottom: 132px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  width: max-content;
  max-width: calc(100% - t.$toast-inset-inline * 2);
  min-height: t.$toast-min-height;
  padding: 8px 22px 8px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #d4cbbe;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: 0 -2px 8px rgba(255, 255, 255, .8), 0 8px 24px rgba(140, 136, 127, .36), 0 2px 6px rgba(107, 102, 92, .2);
  color: t.$text-main;
  font: t.$font-weight-medium 14px t.$font-family;
  img { width: 22px; height: 22px; flex-shrink: 0; }
}
.space-toast-enter-active, .space-toast-leave-active { transition: opacity .5s ease; }
.space-toast-enter-from, .space-toast-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .expand-icon, .selector-chevron { transition: none; }
}
</style>
