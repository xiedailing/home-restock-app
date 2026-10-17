<script setup>
// 補貨明細（原用品詳情；specs/011-item-detail-revision，沿革 specs/003-item-detail）。
// 定位成「一個用品的補貨帳本」：名稱、圖示、分類、單位屬於全域用品，到「設定 > 用品管理」編輯；這裡不能改。
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { getStatusMarks } from '../models/item'
import { getItemIconSrc } from '../assets/household-icons-by-state/index.js'
import { useToast } from '../composables/useToast'
import AppToast from '../components/AppToast.vue'
import StatusMarks from '../components/items/StatusMarks.vue'
import StatusCard from '../components/item-detail/StatusCard.vue'
import RestockSheet from '../components/item-detail/RestockSheet.vue'
import RestockRecordList from '../components/item-detail/RestockRecordList.vue'
import { deleteItemTitle, deleteItemMessage } from '../utils/deleteCopy.js'
import backIcon from '../assets/add-item/back-chevron.svg'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const { itemsWithStatus, spaces } = storeToRefs(itemsStore)
const { toast, showToast, runUndo } = useToast()

const itemId = route.params.id
const item = computed(() => itemsWithStatus.value.find((entry) => entry.id === itemId))
const itemSpace = computed(() => spaces.value.find((space) => space.id === item.value?.spaceId))
// 右上角的狀態標記與用品圖示都依提醒狀態，不看購買清單；已在清單由標記表達，與列表同一套規則（specs/010 FR-1001、FR-1005）。
const marks = computed(() => (item.value ? getStatusMarks(item.value.reminderStatus, item.value.inShoppingList) : { pill: null, showListMark: false }))
const spaceName = computed(() => itemSpace.value?.name ?? '未指定空間')

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

// 共享空間的用品在「共享清單」才看得到（未認購／他人認購不在「我的清單」），並預選該空間篩選。
function viewShoppingList() {
  if (itemSpace.value?.shared) router.push({ name: 'shopping', query: { tab: 'shared', space: itemSpace.value.id } })
  else router.push({ name: 'shopping' })
}

// 變更前先保存整筆 snapshot，Toast「復原」時還原（specs/003 DET-15）。
function changeWithUndo(message, change) {
  const snapshot = itemsStore.snapshotItem(itemId)
  change()
  showToast(message, () => itemsStore.restoreItem(snapshot))
}

// ---------- 「⋯」選單（specs/011 FR-1102）：做法同補貨頁 ----------
const moreOpen = ref(false)
const moreButton = ref(null)
const morePopover = ref(null)

async function toggleMore() {
  moreOpen.value = !moreOpen.value
  if (!moreOpen.value) return
  await nextTick()
  morePopover.value?.querySelector('button')?.focus()
}
function closeMore({ restoreFocus = false } = {}) {
  moreOpen.value = false
  if (restoreFocus) moreButton.value?.focus()
}
function onMoreFocusout(event) {
  const target = event.relatedTarget
  if (!moreOpen.value || !target) return
  if (morePopover.value?.contains(target) || moreButton.value?.contains(target)) return
  closeMore()
}
// 帶 ?from=detail：用品管理的返回鈕會用 router.back() 回到這一頁（FR-1109）。
function openItemManagement() {
  closeMore()
  router.push({ name: 'item-management', query: { from: 'detail' } })
}
function askDelete() {
  closeMore()
  deleteDialog.value?.showModal()
}

// ---------- 補貨提醒（FR-304、FR-305）----------
// 預計補貨日由補貨紀錄推算，不能手填或修改（specs/009 FR-912）；開關只在紀錄涵蓋兩個以上不同日期時出現（FR-913）。
const reminderSwitchOn = computed(() => item.value.reminderEnabled)

// 關閉前先跳確認 modal，說明後果（DET-22）；開啟時直接用補貨紀錄重算。開啟與關閉都不顯示 Toast。
const reminderOffDialog = ref(null)
function toggleReminder() {
  if (item.value.reminderEnabled) reminderOffDialog.value?.showModal()
  else itemsStore.enableReminder(itemId)
}
function confirmReminderOff() {
  itemsStore.disableReminder(itemId)
  reminderOffDialog.value?.close()
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
      <h1>補貨明細</h1>
      <button
        ref="moreButton"
        type="button"
        class="icon-button"
        aria-haspopup="menu"
        :aria-expanded="moreOpen"
        aria-label="更多"
        @click="toggleMore"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>

      <template v-if="moreOpen">
        <div class="more-backdrop" @click="closeMore()" />
        <div
          ref="morePopover"
          class="more-popover"
          role="menu"
          aria-label="更多"
          @keydown.esc.stop="closeMore({ restoreFocus: true })"
          @focusout="onMoreFocusout"
        >
          <button type="button" class="more-option" role="menuitem" @click="openItemManagement">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
            <span>用品管理</span>
          </button>
          <div class="more-divider" aria-hidden="true" />
          <button type="button" class="more-option more-option--danger" role="menuitem" @click="askDelete">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 8.5v5M11.5 8.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>刪除用品</span>
          </button>
        </div>
      </template>
    </header>

    <!-- 用品摘要：名稱與圖示不可改（FR-1103） -->
    <section class="summary-card" aria-label="用品摘要">
      <span class="summary-icon" aria-hidden="true">
        <img :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc(item, item.reminderStatus)" alt="" />
      </span>
      <div class="summary-body">
        <h2 class="item-name">{{ item.name }}</h2>
        <p class="item-meta">{{ spaceName }}<template v-if="item.category">・{{ item.category }}</template></p>
      </div>
      <StatusMarks class="summary-status" :marks="marks" />
    </section>

    <StatusCard
      :item="item"
      :switch-on="reminderSwitchOn"
      @restock="restockOpen = true"
      @add-to-list="addToShoppingList"
      @view-list="viewShoppingList"
      @toggle-reminder="toggleReminder"
    />

    <section class="detail-section" aria-labelledby="records-title">
      <div class="section-header">
        <h2 id="records-title" class="section-title">補貨紀錄</h2>
        <RouterLink v-if="item.restockRecords.length > RECORD_PREVIEW_LIMIT" class="see-all" :to="{ name: 'item-records', params: { id: item.id } }">查看全部 ›</RouterLink>
      </div>
      <RestockRecordList :item="item" :limit="RECORD_PREVIEW_LIMIT" @edited="onRecordEdited" />
    </section>

    <RestockSheet
      :open="restockOpen"
      :unit="item.unit"
      :reminder-enabled="item.reminderEnabled"
      @confirm="onRestockConfirm"
      @close="restockOpen = false"
    />

    <!-- 刪除確認：文字與樣式同我的用品。 -->
    <dialog ref="deleteDialog" class="delete-dialog" tabindex="-1" autofocus aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-desc">
      <h2 id="delete-dialog-title">{{ deleteItemTitle(item) }}</h2>
      <p id="delete-dialog-desc">{{ deleteItemMessage(item, itemSpace) }}</p>
      <div class="delete-dialog-actions">
        <button type="button" class="delete-dialog-cancel" @click="deleteDialog.close()">取消</button>
        <button type="button" class="delete-dialog-confirm" @click="confirmDelete">刪除</button>
      </div>
    </dialog>

    <!-- 關閉補貨提醒確認：版型同刪除確認，確認鈕用主色。 -->
    <dialog ref="reminderOffDialog" class="delete-dialog reminder-off-dialog" tabindex="-1" autofocus aria-labelledby="reminder-off-title" aria-describedby="reminder-off-desc">
      <h2 id="reminder-off-title">關閉補貨提醒？</h2>
      <p id="reminder-off-desc">關閉後，「{{ item.name }}」不會再提醒補貨，也不會顯示預計補貨日。之後重新開啟，會用補貨紀錄重新推算。</p>
      <div class="delete-dialog-actions">
        <button type="button" class="delete-dialog-cancel" @click="reminderOffDialog.close()">取消</button>
        <button type="button" class="delete-dialog-confirm" @click="confirmReminderOff">關閉提醒</button>
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
  position: relative;
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
  color: t.$text-main;
  img { display: block; }
}

// ---------- 「⋯」選單（同補貨頁）----------
.more-backdrop { position: fixed; inset: 0; z-index: 1; }
.more-popover {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 2;
  width: 200px;
  padding: t.$space-8;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-popover;
  background: t.$card-bg;
  box-shadow: t.$shadow-floating;
}
.more-option {
  display: flex;
  align-items: center;
  gap: t.$space-12;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular t.$font-size-button / normal t.$font-family;
  text-align: left;
  cursor: pointer;
  svg { flex: none; color: t.$text-body; }
  &:hover { background: t.$primary-soft; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }
  &--danger { color: t.$danger; svg { color: t.$danger; } }
}
.more-divider { height: 1px; margin: t.$space-4 t.$space-8; background: t.$border-color; }

// ---------- 用品摘要 ----------
.summary-card {
  --icon-bg: #{t.$icon-circle-bg};
  padding: t.$space-16;
  display: flex;
  align-items: flex-start;
  gap: t.$space-12;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
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
.item-name { margin: 0; min-width: 0; overflow-wrap: anywhere; font: t.$font-weight-bold 20px / 28px t.$font-family; }
.item-meta { margin: 0; color: t.$text-sub; font: t.$font-weight-regular 14px / 20px t.$font-family; overflow-wrap: anywhere; }
// 右上角狀態標記：與名稱第一行（28px）垂直對齊；圓圈與 pill 固定不縮小（specs/010 FR-1004）。
.summary-status { margin-top: 2px; }

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
  .reminder-off-dialog & { background: t.$primary-green; }
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}
</style>
