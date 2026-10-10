<script setup>
// 用品詳情（specs/003-item-detail，003-A）。Figma：[Draft] 用品詳情・提醒開關（2293:19044）。
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { STATUS_LABELS, matchItemIconKey } from '../models/item'
import { limitSpaceName } from '../models/space'
import { getItemIcon } from '../assets/household-icons-by-state/index.js'
import { useToast } from '../composables/useToast'
import AppToast from '../components/AppToast.vue'
import SwitchTrack from '../components/SwitchTrack.vue'
import StatusCard from '../components/item-detail/StatusCard.vue'
import BasicInfoSection from '../components/item-detail/BasicInfoSection.vue'
import ReminderSetupSheet from '../components/item-detail/ReminderSetupSheet.vue'
import RestockSheet from '../components/item-detail/RestockSheet.vue'
import RestockRecordList from '../components/item-detail/RestockRecordList.vue'
import backIcon from '../assets/add-item/back-chevron.svg'
import selectorChevron from '../assets/add-item/selector-chevron.svg'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const { itemsWithStatus, spaces } = storeToRefs(itemsStore)
const { toast, showToast, runUndo } = useToast()

const itemId = route.params.id
const item = computed(() => itemsWithStatus.value.find((entry) => entry.id === itemId))
const spaceName = computed(() => spaces.value.find((space) => space.id === item.value?.spaceId)?.name ?? '未指定空間')
const formatDate = (date) => date?.replaceAll('-', '/') ?? '—'

// 用品不存在（已刪除、重新整理後 id 失效）時回到我的用品；自己刪除時由 confirmDelete 導頁。
let leaving = false
watch(item, (current) => {
  if (!current && !leaving) router.replace({ name: 'inventory' })
}, { immediate: true })

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'inventory' })
}

// 新增用品後帶 ?created 進來；顯示一次 Toast 後移除 query，避免重新整理再出現。
onMounted(() => {
  if (!route.query.created) return
  router.replace({ query: { ...route.query, created: undefined } })
  showToast('已新增用品')
})

// 變更前先保存整筆 snapshot，Toast「復原」時還原（specs/003 DET-15）。
function changeWithUndo(message, change) {
  const snapshot = itemsStore.snapshotItem(itemId)
  change()
  showToast(message, () => itemsStore.restoreItem(snapshot))
}

// ---------- 改名（FR-301）----------
const editingName = ref(false)
const nameDraft = ref('')
const nameError = ref('')
const nameInput = ref(null)

async function startRename() {
  nameDraft.value = item.value.name
  nameError.value = ''
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

// 長度規則同新增用品：中文算 2、英數算 1，上限 16；組字期間不截斷。
function updateNameDraft(event) {
  if (event.isComposing) return
  const limited = limitSpaceName(event.target.value)
  if (limited !== event.target.value) event.target.value = limited
  nameDraft.value = limited
  if (limited.trim()) nameError.value = ''
}

// 只在離開輸入框、Enter、點 ✓ 時儲存（specs/003 DET-06）。名稱為空時不儲存、留在編輯狀態。
function saveName() {
  if (!editingName.value) return
  const name = nameDraft.value.trim()
  if (!name) {
    nameError.value = '請輸入用品名稱。'
    return
  }
  editingName.value = false
  if (name === item.value.name) return
  changeWithUndo('已更新用品名稱', () => itemsStore.updateItem(itemId, { name, iconKey: matchItemIconKey(name) }))
}

function cancelRename() {
  editingName.value = false
  nameError.value = ''
}

// ---------- 基本資訊（FR-303）----------
const FIELD_LABELS = { spaceId: '所屬空間', category: '分類', unit: '補貨單位' }
function onBasicInfoChange(field, value) {
  changeWithUndo(`已更新${FIELD_LABELS[field]}`, () => itemsStore.updateItem(itemId, { [field]: value }))
}

// ---------- 補貨提醒（FR-304、FR-305）----------
const reminderSheetMode = ref(null) // 'setup' | 'date'
// 打開開關後 Sheet 顯示期間開關先呈現開啟；取消時回到關閉（001 F3）。
const reminderSwitchOn = computed(() => item.value.reminderEnabled || reminderSheetMode.value === 'setup')

function toggleReminder() {
  if (item.value.reminderEnabled) changeWithUndo('已關閉補貨提醒', () => itemsStore.disableReminder(itemId))
  else reminderSheetMode.value = 'setup'
}

function onReminderSheetDone({ quantity, nextRestockDate }) {
  if (reminderSheetMode.value === 'setup') {
    itemsStore.enableReminder(itemId, { quantity, nextRestockDate })
    // 開啟不提供復原：復原等於關閉，直接用開關即可（specs/003 DET-08）。
    showToast('已開啟補貨提醒')
  } else {
    changeWithUndo('已更新下次預計補貨日', () => itemsStore.updateNextRestockDate(itemId, nextRestockDate))
  }
}

// ---------- 記錄補貨（FR-306）與購買清單（FR-308）----------
const restockOpen = ref(false)
function onRestockConfirm(restock) {
  changeWithUndo('已記錄補貨', () => itemsStore.completeRestock(itemId, restock))
}

function addToShoppingList() {
  changeWithUndo('已加入購買清單', () => itemsStore.addToShoppingList(itemId))
}

// ---------- 補貨紀錄（FR-307）----------
// 最多顯示 5 筆，超過 5 筆才顯示「查看全部」（specs/003 DET-09）。
const RECORD_PREVIEW_LIMIT = 5
function onRecordEdited({ message, snapshot }) {
  showToast(message, () => itemsStore.restoreItem(snapshot))
}

// ---------- 刪除（FR-309）----------
const deleteDialog = ref(null)

// 刪除後回到我的用品，由我的用品顯示可復原的刪除 Toast（specs/003 DET-20）。
function confirmDelete() {
  leaving = true
  itemsStore.removeItem(itemId)
  deleteDialog.value?.close()
  if (window.history.state?.back?.startsWith('/inventory')) router.back()
  else router.replace({ name: 'inventory' })
}
</script>

<template>
  <div v-if="item" class="item-detail-page">
    <header class="app-bar">
      <button type="button" class="icon-button" aria-label="返回" @click="goBack">
        <img :src="backIcon" alt="" />
      </button>
      <h1>用品詳情</h1>
      <button type="button" class="delete-button" aria-label="刪除用品" @click="deleteDialog.showModal()">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 8.5v5M11.5 8.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </header>

    <!-- 用品摘要（FR-301） -->
    <section class="summary-card" :class="`summary-card--${item.status}`" aria-label="用品摘要">
      <span class="summary-icon" aria-hidden="true">
        <img :src="getItemIcon(item.iconKey, item.status)" alt="" />
      </span>
      <div class="summary-body">
        <div v-if="editingName" class="name-edit">
          <input
            ref="nameInput"
            :value="nameDraft"
            class="name-input"
            :class="{ 'name-input--error': nameError }"
            type="text"
            aria-label="用品名稱"
            autocomplete="off"
            :aria-invalid="!!nameError"
            :aria-describedby="nameError ? 'name-error' : undefined"
            @input="updateNameDraft"
            @compositionend="updateNameDraft"
            @keydown.enter.prevent="saveName"
            @keydown.esc.prevent="cancelRename"
            @blur="saveName"
          />
          <button type="button" class="name-confirm" aria-label="儲存名稱" @mousedown.prevent @click="saveName">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
        <div v-else class="name-row">
          <h2 class="item-name">{{ item.name }}</h2>
          <button type="button" class="name-edit-button" aria-label="修改名稱" @click="startRename">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.89 3.39L16.6 6.11C17.06 6.57 17.02 7.35 16.63 7.75L8.62 15.77L3.06 16.93L4.22 11.35C4.22 11.35 11.82 3.72 12.21 3.32C12.6 2.93 13.43 2.93 13.89 3.39ZM11.16 6.18L5.57 11.79L6.68 12.9L12.22 7.25L11.16 6.18ZM8.19 14.41L13.77 8.81L12.7 7.73L7.11 13.33L8.19 14.41Z" fill="currentColor" /></svg>
          </button>
        </div>
        <p v-if="nameError" id="name-error" class="name-error">{{ nameError }}</p>
        <p class="item-meta">{{ spaceName }}<template v-if="item.category">・{{ item.category }}</template></p>
      </div>
      <span class="status-badge">{{ STATUS_LABELS[item.status] }}</span>
    </section>

    <StatusCard
      :item="item"
      @restock="restockOpen = true"
      @add-to-list="addToShoppingList"
      @view-list="router.push({ name: 'shopping' })"
      @enable-reminder="reminderSheetMode = 'setup'"
    />

    <BasicInfoSection :item="item" :spaces="spaces" @change="onBasicInfoChange" />

    <!-- 補貨資訊（001 FR-005：開關、下次預計補貨日、上次補貨） -->
    <section class="detail-section" aria-labelledby="restock-info-title">
      <h2 id="restock-info-title" class="section-title">補貨資訊</h2>
      <div class="list-card">
        <div class="list-row info-row">
          <span id="reminder-switch-label" class="info-label">補貨提醒</span>
          <button type="button" class="reminder-switch" role="switch" :aria-checked="reminderSwitchOn" aria-labelledby="reminder-switch-label" @click="toggleReminder">
            <SwitchTrack :checked="reminderSwitchOn" />
          </button>
        </div>
        <div v-if="item.reminderEnabled" class="list-row">
          <button type="button" class="info-row info-row--button" @click="reminderSheetMode = 'date'">
            <span class="info-label">下次預計補貨日</span>
            <span class="info-value">{{ formatDate(item.nextRestockDate) }}</span>
            <img :src="selectorChevron" alt="" />
          </button>
        </div>
        <!-- 只顯示；要修改請到補貨紀錄（specs/003 DET-13）。 -->
        <div class="list-row info-row">
          <span class="info-label">上次補貨</span>
          <span class="info-value">{{ formatDate(item.lastRestockDate) }}</span>
        </div>
      </div>
    </section>

    <section class="detail-section" aria-labelledby="records-title">
      <div class="section-header">
        <h2 id="records-title" class="section-title">補貨紀錄</h2>
        <RouterLink v-if="item.restockRecords.length > RECORD_PREVIEW_LIMIT" class="see-all" :to="{ name: 'item-records', params: { id: item.id } }">查看全部 ›</RouterLink>
      </div>
      <RestockRecordList :item="item" :limit="RECORD_PREVIEW_LIMIT" @edited="onRecordEdited" />
    </section>

    <ReminderSetupSheet
      :open="reminderSheetMode !== null"
      :mode="reminderSheetMode ?? 'setup'"
      :unit="item.unit"
      :initial-date="item.nextRestockDate"
      @done="onReminderSheetDone"
      @close="reminderSheetMode = null"
    />
    <RestockSheet
      :open="restockOpen"
      :unit="item.unit"
      :reminder-enabled="item.reminderEnabled"
      @confirm="onRestockConfirm"
      @close="restockOpen = false"
    />

    <!-- 刪除確認：文字與樣式同我的用品。 -->
    <dialog ref="deleteDialog" class="delete-dialog" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-desc">
      <h2 id="delete-dialog-title">刪除「{{ item.name }}」？</h2>
      <p id="delete-dialog-desc">刪除後，這項用品會從「{{ spaceName }}」空間移除。</p>
      <div class="delete-dialog-actions">
        <button type="button" class="delete-dialog-cancel" @click="deleteDialog.close()">取消</button>
        <button type="button" class="delete-dialog-confirm" @click="confirmDelete">刪除</button>
      </div>
    </dialog>

    <AppToast :toast="toast" @undo="runUndo" />
  </div>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../components/item-detail/section' as section;

.item-detail-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  // 底部留給 Toast（46px＋高 52px）。
  padding: t.$space-16 0 104px;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  color: t.$text-main;
  font-family: t.$font-family;
  text-align: left;
}

// ---------- App Bar ----------
.app-bar {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: t.$font-weight-bold #{t.$font-size-app-bar}/#{t.$line-height-app-bar} t.$font-family; }
}
.icon-button {
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
.delete-button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: t.$text-sub;
  svg { width: 20px; height: 20px; }
}

// ---------- 用品摘要 ----------
.summary-card {
  --badge-bg: #{t.$success-subtle};
  --badge-text: #{t.$success};
  --icon-bg: #{t.$success-subtle};
  padding: t.$space-16;
  display: flex;
  align-items: flex-start;
  gap: t.$space-12;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
  &--dueSoon { --badge-bg: #ffebd7; --badge-text: #{t.$accent-text}; --icon-bg: #ffdec0; }
  // 補貨時間已過：明顯徽章，但不用紅色（001 D6）。
  &--overdue { --badge-bg: #{t.$accent-text}; --badge-text: #{t.$text-inverse}; --icon-bg: #ffdec0; }
  &--inShoppingList { --badge-bg: #{t.$primary-subtle}; --badge-text: #{t.$primary-green}; --icon-bg: #{t.$primary-subtle}; }
  &--reminderOff { --badge-bg: #f0eee8; --badge-text: #{t.$text-body}; --icon-bg: #f5f5f6; }
}
.summary-icon {
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--icon-bg);
  box-shadow: inset -2.308px -2.308px 4.615px rgba(255, 255, 255, .9), inset 2.308px 2.308px 4.615px rgba(184, 131, 90, .22);
  img { display: block; width: 52px; height: 52px; object-fit: contain; }
}
.summary-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: t.$space-4; }
.name-row { display: flex; align-items: center; gap: t.$space-4; min-width: 0; }
.item-name { margin: 0; min-width: 0; overflow-wrap: anywhere; font: t.$font-weight-bold 20px / 28px t.$font-family; }
.name-edit-button, .name-confirm {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: t.$text-body;
  svg { width: 18px; height: 18px; }
}
.name-edit { display: flex; align-items: center; gap: t.$space-4; }
.name-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 t.$space-8;
  border: 1.5px solid t.$primary-green;
  border-radius: t.$radius-sm;
  background: t.$card-bg;
  color: t.$text-main;
  font: t.$font-weight-bold 18px / 24px t.$font-family;
  &:focus { outline: none; }
  // 名稱為空：暖橘外框（Figma 1208:13658）。
  &--error { border-color: t.$accent-orange; }
}
.name-error { margin: 0; color: t.$accent-text; font: t.$font-weight-regular 13px / 18px t.$font-family; }
.item-meta { margin: 0; color: t.$text-sub; font: t.$font-weight-regular 14px / 20px t.$font-family; overflow-wrap: anywhere; }
.status-badge {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 3px 9px;
  border-radius: t.$radius-pill;
  background: var(--badge-bg);
  color: var(--badge-text);
  font: t.$font-weight-medium #{t.$font-size-caption}/18px t.$font-family;
  white-space: nowrap;
}
.summary-card--overdue .status-badge { font-weight: t.$font-weight-bold; }

// ---------- 補貨資訊 ----------
.info-row {
  width: 100%;
  min-height: 48px;
  padding: t.$space-8 t.$space-16;
  display: flex;
  align-items: center;
  gap: t.$space-8;
  &--button { border: 0; background: transparent; text-align: left; }
  img { flex-shrink: 0; }
}
.info-label { flex: 1; color: t.$text-body; font: t.$font-weight-regular 15px / normal t.$font-family; }
.info-value { color: t.$text-main; font: t.$font-weight-medium 15px / normal t.$font-family; }
.reminder-switch {
  flex: 0 0 t.$switch-width;
  height: t.$switch-height;
  padding: 0;
  border: 0;
  border-radius: t.$switch-radius;
  background: transparent;
}

// ---------- 補貨紀錄 ----------
.section-header { display: flex; align-items: baseline; justify-content: space-between; padding-right: t.$space-4; }
.see-all {
  color: t.$text-sub;
  font: t.$font-weight-regular 13px / 22px t.$font-family;
  text-decoration: none;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: t.$radius-sm; }
}

// ---------- 刪除確認（同 InventoryView .delete-dialog）----------
.delete-dialog {
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
  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold 18px / 1.45 t.$font-family; overflow-wrap: anywhere; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular 15px / 1.45 t.$font-family; overflow-wrap: anywhere; }
}
.delete-dialog-actions { display: flex; gap: t.$space-12; margin-top: 32px; }
.delete-dialog-cancel, .delete-dialog-confirm {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 t.$space-24;
  border: 0;
  border-radius: t.$radius-pill;
  font: t.$font-weight-medium 15px / normal t.$font-family;
}
.delete-dialog-cancel { background: t.$input-bg; box-shadow: t.$shadow-raised; color: t.$text-button-secondary; }
.delete-dialog-confirm {
  background: t.$danger;
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}
</style>
