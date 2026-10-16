<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import ItemListRow from '../components/items/ItemListRow.vue'
import AddSpaceSheet from '../components/add-item/AddSpaceSheet.vue'
import SpacePill from '../components/SpacePill.vue'
import CategoryPills from '../components/CategoryPills.vue'
import AppToast from '../components/AppToast.vue'
import { useToast } from '../composables/useToast'
import { useItemsStore } from '../stores/items'
import { DEFAULT_SPACE_ID, STATUS, getReminderStatus } from '../models/item'
import { getItemCategory } from '../models/itemCategories'
import BrandLogo from '../components/BrandLogo.vue'
import ProfileAvatarMenu from '../components/ProfileAvatarMenu.vue'
import { deleteItemTitle, deleteItemMessage } from '../utils/deleteCopy.js'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-in-shopping-list-plain.svg'

// Figma 原始搜尋 SVG；嵌入資料網址，避免依賴會過期的素材 URL。
const searchIcon = 'data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJJY29uIC8gU2VhcmNoIj4KPGNpcmNsZSBpZD0iRWxsaXBzZSIgY3g9IjgiIGN5PSI4IiByPSI1IiBzdHJva2U9IiM4Qjg4ODAiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBpZD0iVmVjdG9yIiBkPSJNMTMgMTNMMTcgMTciIHN0cm9rZT0iIzhCODg4MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8L3N2Zz4K'

const itemsStore = useItemsStore()
// 空間選擇存在 store，讓 Bottom Nav【＋】可預帶目前空間；仍不持久化。
const { items, itemsWithStatus, spaces, inventorySpaceId: storedSpaceId, recentlyRemoved, today, remindWithinDays } = storeToRefs(itemsStore)
// 沒有「所有空間」：store 尚未選過（或已選空間被退出而重設）時，一律回到個人空間。
const selectedSpaceId = computed({
  get: () => storedSpaceId.value ?? DEFAULT_SPACE_ID,
  set: (spaceId) => { storedSpaceId.value = spaceId },
})

// 搜尋字串僅留在頁面層，不進 store、不持久化。
const searchQuery = ref('')

// 新增空間：同新增用品頁的 Sheet；建立後切到新空間並顯示 Toast。
const addSpaceOpen = ref(false)
const { toast, showToast, runUndo } = useToast()
function openAddSpace() {
  addSpaceOpen.value = true
}
function onSpaceCreated(space) {
  selectSpace(space.id)
  showToast('已成功新增空間')
}
// 左滑刪除的 UI state 僅留在頁面層，不進 store。
const revealedItemId = ref(null) // 同一時間只允許一列展開
const pendingDeleteItem = ref(null)
const isDeleteDialogOpen = ref(false)
const deleteDialog = ref(null)

const pendingDeleteSpace = computed(() => spaces.value.find((space) => space.id === pendingDeleteItem.value?.spaceId))

// 點擊已展開列以外的區域（含其他列）時收回；展開列本身由列元件自行處理。
function closeRevealedOutside(event) {
  if (revealedItemId.value === null) return
  const row = event.target.closest?.('[data-item-id]')
  if (row?.dataset.itemId !== revealedItemId.value) revealedItemId.value = null
}

function openDeleteDialog(item) {
  pendingDeleteItem.value = item
  revealedItemId.value = null
  isDeleteDialogOpen.value = true
  deleteDialog.value?.showModal()
}

// close 事件涵蓋取消、刪除與 Esc，統一清除待刪除狀態。
function onDeleteDialogClose() {
  isDeleteDialogOpen.value = false
  pendingDeleteItem.value = null
}

// 最近一次刪除存在 store（不做 stack），讓用品詳情刪除後回到這裡仍可復原（specs/003 DET-20）。
// 這裡只負責 Toast 顯示到期後清除；store 記錄到期時間，回到此頁時只顯示剩餘時間。
let toastTimer = null
let pausedRemaining = null // 刪除 Toast 暫停倒數時的剩餘毫秒
watch(recentlyRemoved, (removed) => {
  pausedRemaining = null
  clearTimeout(toastTimer) // 新刪除取代舊 Toast，避免舊 timer 提早關閉
  if (!removed) return
  const remaining = removed.expiresAt - Date.now()
  if (remaining <= 0) itemsStore.clearRecentlyRemoved()
  else toastTimer = setTimeout(() => itemsStore.clearRecentlyRemoved(), remaining)
}, { immediate: true })
onUnmounted(() => clearTimeout(toastTimer))

// 觸碰、滑鼠停留或聚焦在刪除 Toast 上時暫停倒數，離開後以剩餘時間繼續。
function pauseDeleteToast() {
  if (!recentlyRemoved.value || pausedRemaining !== null) return
  clearTimeout(toastTimer)
  pausedRemaining = Math.max(recentlyRemoved.value.expiresAt - Date.now(), 0)
}
function resumeDeleteToast() {
  if (pausedRemaining === null || !recentlyRemoved.value) return
  recentlyRemoved.value.expiresAt = Date.now() + pausedRemaining
  toastTimer = setTimeout(() => itemsStore.clearRecentlyRemoved(), pausedRemaining)
  pausedRemaining = null
}

function confirmDelete() {
  const target = pendingDeleteItem.value
  if (!target) return
  itemsStore.removeItem(target.id)
  revealedItemId.value = null
  deleteDialog.value?.close() // close 事件會清除 pendingDeleteItem
}

// 放回原本的位置，保留原 id、spaceId、restockRecords、timestamps。
function undoDelete() {
  itemsStore.undoRemoveItem()
}

const router = useRouter()

function openItemDetail(item) {
  router.push({ name: 'item-detail', params: { id: item.id } })
}

function openAddItem() {
  router.push({ name: 'restock-record', query: selectedSpaceId.value ? { space: selectedSpaceId.value } : {} })
}

function onDocumentPointerDown(event) {
  closeRevealedOutside(event)
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

const selectedSpace = computed(
  () => spaces.value.find((space) => space.id === selectedSpaceId.value)
    ?? spaces.value.find((space) => space.id === DEFAULT_SPACE_ID),
)

function filterBySpace(list, spaceId) {
  return spaceId === null ? list : list.filter((item) => item.spaceId === spaceId)
}

// 空間是主要瀏覽 context；切換時（含切回所有用品）重置搜尋，不保留「搜尋 AND 空間」。
function selectSpace(spaceId) {
  // 重新點選同一空間不重置搜尋（浮層由 SpacePill 自己關閉）。
  if (spaceId === selectedSpaceId.value) return
  selectedSpaceId.value = spaceId
  searchQuery.value = ''
}

// 每個篩選都是 (list) => list 的純函式；Phase 2 的空間／分類／狀態篩選可直接接在後面。
function filterByName(list, query) {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return list
  return list.filter((item) => item.name.toLocaleLowerCase().includes(keyword))
}

// 預設排序：越緊急越上面。同狀態維持原本順序（Array.prototype.sort 為穩定排序）。
const STATUS_PRIORITY = [
  STATUS.OVERDUE,
  STATUS.DUE_SOON,
  STATUS.IN_SHOPPING_LIST,
  STATUS.NOT_NEEDED,
  STATUS.REMINDER_OFF,
]

function statusRank(status) {
  const index = STATUS_PRIORITY.indexOf(status)
  return index === -1 ? STATUS_PRIORITY.length : index
}

function sortByUrgency(list) {
  return [...list].sort((a, b) => statusRank(a.status) - statusRank(b.status))
}

// 非共享空間只有自己，加入購買清單不代表已補貨，列表仍顯示提醒狀態（該補貨了）；
// 共享空間要讓其他成員一眼看到「購買清單中」。只影響本頁列表，不動共用的 getStatus。
const displayItems = computed(() =>
  itemsWithStatus.value.map((item) => {
    if (item.status !== STATUS.IN_SHOPPING_LIST || itemsStore.getSpace(item.spaceId)?.shared) return item
    return { ...item, status: getReminderStatus(item, today.value, remindWithinDays.value) }
  }),
)
const spaceItems = computed(() =>
  sortByUrgency(filterBySpace(displayItems.value, selectedSpaceId.value)),
)
const selectedCategory = ref(null) // null = 全部；僅頁面層、單選、不持久化
// 類別只在目前空間有用品時列出（ADD-14）。搜尋不影響，避免輸入時選項跳動。
const availableCategories = computed(() =>
  itemsStore.categoryOptions.filter((category) => spaceItems.value.some((item) => getItemCategory(item) === category)),
)
watch(availableCategories, (categories) => {
  if (selectedCategory.value !== null && !categories.includes(selectedCategory.value)) selectedCategory.value = null
})

function filterByCategory(list, category) {
  return category === null ? list : list.filter((item) => getItemCategory(item) === category)
}

// 空間 scope AND 搜尋 AND 類別。用品狀態不再提供篩選：列表已依緊急程度排序，狀態以徽章呈現（UT-32）。
const visibleItems = computed(() =>
  filterByCategory(filterByName(spaceItems.value, searchQuery.value), selectedCategory.value),
)

// 列表因篩選而不再包含展開列時，重置展開狀態。
watch(
  () => visibleItems.value.some((item) => item.id === revealedItemId.value),
  (stillVisible) => { if (!stillVisible) revealedItemId.value = null },
)

// 搜尋、類別屬於 filter；目前空間是 browsing context，不算 active filter。
const trimmedQuery = computed(() => searchQuery.value.trim())
const hasActiveFilter = computed(
  () => trimmedQuery.value !== '' || selectedCategory.value !== null,
)

// 0 筆結果的三種狀態互斥，依優先順序判斷：
// general（完全沒有用品）→ space（此空間沒有用品且無 filter）→ noResults（filter 後 0 筆）。
const emptyState = computed(() => {
  if (items.value.length === 0) return 'general'
  if (!hasActiveFilter.value && spaceItems.value.length === 0) return 'space'
  if (hasActiveFilter.value && visibleItems.value.length === 0) return 'noResults'
  return null
})

// 清除搜尋、類別；保留目前空間。
function clearFilters() {
  searchQuery.value = ''
  selectedCategory.value = null
}
</script>

<template>
  <section class="inventory-page" aria-labelledby="inventory-title">
    <div class="inventory-sticky-header">
      <header class="inventory-header">
        <div class="inventory-brand">
          <BrandLogo />
          <div class="inventory-heading">
            <h1 id="inventory-title" class="visually-hidden">我的用品</h1>
            <SpacePill
              :model-value="selectedSpace?.id ?? null"
              :spaces="spaces"
              @update:model-value="selectSpace"
              @add-space="openAddSpace"
            />
          </div>
        </div>
        <ProfileAvatarMenu :to="{ name: 'edit-profile' }" />
      </header>

      <template v-if="items.length">
        <!-- 搜尋；下方為用品類別 pills（橫向捲動）。 -->
        <div class="inventory-toolbar">
          <div class="inventory-search">
            <img class="search-icon" :src="searchIcon" alt="" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜尋用品"
              aria-label="搜尋用品"
            />
          </div>
        </div>

        <!-- 用品類別：只列目前空間有用品的類別；只有一種類別時不需要篩選。 -->
        <CategoryPills v-if="availableCategories.length > 1" v-model="selectedCategory" :categories="availableCategories" />
      </template>
    </div>

    <!-- 搜尋／篩選後 0 筆 -->
    <div v-if="emptyState === 'noResults'" class="inventory-empty" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <img :src="emptyItemIcon" alt="" />
      </div>
      <div class="empty-copy">
        <h2>找不到符合條件的用品</h2>
        <p>試著調整搜尋或篩選條件</p>
      </div>
      <button type="button" class="empty-clear" @click="clearFilters">清除篩選</button>
    </div>

    <!-- 目前空間沒有用品（無任何 filter） -->
    <div v-else-if="emptyState === 'space'" class="inventory-empty" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <img :src="emptyItemIcon" alt="" />
      </div>
      <div class="empty-copy">
        <h2>這個空間目前還沒有用品</h2>
      </div>
      <button type="button" class="btn btn-primary empty-add" @click="openAddItem">
        <span class="add-symbol" aria-hidden="true">＋</span>
        新增用品
      </button>
    </div>

    <ul v-else-if="emptyState === null" class="item-list" aria-label="我的用品列表">
      <ItemListRow
        v-for="item in visibleItems"
        :key="item.id"
        :item="item"
        :revealed="revealedItemId === item.id"
        @reveal="revealedItemId = item.id"
        @close="revealedItemId = null"
        @delete="openDeleteDialog"
        @open="openItemDetail"
      />
    </ul>

    <!-- 完全沒有任何用品 -->
    <div v-else class="inventory-empty" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <img :src="emptyItemIcon" alt="" />
      </div>
      <div class="empty-copy">
        <h2>目前沒有用品</h2>
        <p>新增第一項用品，開始追蹤補貨提醒</p>
      </div>
      <button type="button" class="btn btn-primary empty-add" @click="openAddItem">
        <span class="add-symbol" aria-hidden="true">＋</span>
        新增用品
      </button>
    </div>

    <!-- 刪除確認；沿用設定頁的原生 dialog pattern（無 backdrop 關閉）。 -->
    <dialog
      ref="deleteDialog"
      class="delete-dialog"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-desc"
      @close="onDeleteDialogClose"
    >
      <template v-if="pendingDeleteItem">
        <h2 id="delete-dialog-title">{{ deleteItemTitle(pendingDeleteItem) }}</h2>
        <p id="delete-dialog-desc">{{ deleteItemMessage(pendingDeleteItem, pendingDeleteSpace) }}</p>
        <div class="delete-dialog-actions">
          <button type="button" class="delete-dialog-cancel" @click="deleteDialog.close()">取消</button>
          <button type="button" class="delete-dialog-confirm" @click="confirmDelete">刪除</button>
        </div>
      </template>
    </dialog>

    <AddSpaceSheet :open="addSpaceOpen" @close="addSpaceOpen = false" @created="onSpaceCreated" />
    <AppToast :toast="toast" @undo="runUndo" />

    <!-- 刪除成功 Toast：Bottom Nav 上方水平置中。 -->
    <div v-if="recentlyRemoved" class="delete-toast" role="status" aria-live="polite" @pointerenter="pauseDeleteToast" @pointerleave="resumeDeleteToast" @focusin="pauseDeleteToast" @focusout="resumeDeleteToast">
      <svg class="toast-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M5.8 10.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="toast-message">已從「{{ recentlyRemoved.spaceName }}」移除 {{ recentlyRemoved.item.name }}</span>
      <button type="button" class="toast-undo" @click="undoDelete">復原</button>
    </div>

  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/page-header' as ph;

.inventory-page {
  // App.vue 已預留 34px 底部距離＋106px 導覽區，避免重複撐高整頁。
  min-height: calc(100vh - 140px);
  min-height: calc(100dvh - 140px);
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-bottom: t.$space-24;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  color: t.$text-main;
  font-family: t.$font-family;
  letter-spacing: 0;
  text-align: left;
}

.inventory-sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  flex-shrink: 0;
  // 頂部 16px 放在 sticky 內，捲動時背景才會蓋住上方，與首頁、購買清單的 padding-top 一致。
  padding-top: t.$space-16;
  padding-bottom: t.$space-8;
  background: t.$bg-main;
}

.inventory-header,
.inventory-toolbar {
  flex-shrink: 0;
}

// 下方間距由 .inventory-sticky-header 的 gap 提供。
.inventory-header {
  position: relative;
  @include ph.page-header(0);
}

.inventory-brand { @include ph.page-brand; }
.inventory-heading { min-width: 0; }

.inventory-toolbar {
  display: flex;
  align-items: center;
  gap: t.$space-8;
  height: 44px;
}

.inventory-search {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 44px;
  gap: t.$space-8;
  padding-inline: 14px;
  border: 0;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;

  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: t.$text-main;
    font: t.$font-weight-regular #{t.$font-size-body} / 20px t.$font-family;
    letter-spacing: 0;
    appearance: none;
    cursor: text;
    &::placeholder { color: t.$text-disabled; opacity: 1; }
  }
}

.search-icon { display: block; flex: 0 0 20px; }

.item-list {
  flex-shrink: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-input;
  background: t.$card-bg;
  list-style: none;
}

.inventory-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: t.$space-32; text-align: center; }
.inventory-empty > * { flex-shrink: 0; }

.empty-illustration {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: t.$radius-pill;
  background: t.$active-green;
  box-shadow: inset -3px -3px 7px rgba(255, 255, 255, .9), inset 2px 3px 7px rgba(138, 158, 136, .16);
}

.empty-copy {
  width: 100%;
  min-height: 76px;
  h2 { margin: 0 0 2px; color: t.$text-main; font: t.$font-weight-bold #{t.$font-size-heading} / 30px t.$font-family; letter-spacing: 0; }
  p { max-width: 318px; margin: 0 auto; color: t.$text-sub; font-size: t.$font-size-body-sm; line-height: 22px; }
}

.empty-add {
  width: 222px;
  min-height: 48px;
  height: 48px;
  padding-block: 0;
  font-size: t.$font-size-button;
  cursor: default;
  &:hover, &:active { background: t.$primary-green; }
}

.empty-copy h2 { overflow-wrap: anywhere; }

.empty-clear {
  width: 140px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-sub;
  font: t.$font-weight-medium #{t.$font-size-button} / 20px t.$font-family;
  cursor: pointer;
}

.add-symbol { font-size: 20px; line-height: 1; }

// Figma Confirm Dialog：300 寬、圓角 28、左取消右刪除。
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

  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold 18px / 1.45 t.$font-family; overflow-wrap: anywhere; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular 15px / 1.45 t.$font-family; overflow-wrap: anywhere; }
}

.delete-dialog-actions { display: flex; gap: t.$space-12; margin-top: 32px; }

.delete-dialog-cancel,
.delete-dialog-confirm {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 t.$space-24;
  border: 0;
  border-radius: t.$radius-pill;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  cursor: pointer;
}

// 僅限本 Dialog：移除預設藍色 outline，鍵盤聚焦（:focus-visible）改用主綠色 ring。
.delete-dialog:focus,
.delete-dialog-cancel:focus,
.delete-dialog-confirm:focus { outline: none; }

.delete-dialog-cancel:focus-visible,
.delete-dialog-confirm:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }

// Figma Toast / Success；固定在 Bottom Nav（約 106px 區域）上方。
.delete-toast {
  position: fixed;
  left: 50%;
  // Bottom Nav 頂端在 116px（bottom 34 + 高 82）；再留 16px 間距。寬度同 Bottom Nav（358px，窄螢幕兩側各 16px）。
  bottom: 132px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  // 寬度跟內容走（同 Figma），最寬 358px，窄螢幕兩側各留 16px。
  width: max-content;
  max-width: min(t.$toast-max-width, calc(100vw - t.$toast-inset-inline * 2));
  min-height: t.$toast-min-height;
  padding: t.$toast-padding-block t.$toast-padding-inline;
  border-radius: t.$radius-pill;
  background: t.$toast-background;
  box-shadow: t.$toast-shadow;
  transform: translateX(-50%);
}

// 圓形用成功色，勾勾用 Toast 底色，讓勾勾在深色底上「挖空」顯現。
.toast-icon {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  color: t.$toast-success-accent;
  path { stroke: t.$toast-background; }
}

.toast-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: t.$toast-text;
  font: t.$font-weight-medium 14px / 20px t.$font-family;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-undo {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: t.$toast-success-accent;
  font: t.$font-weight-bold 14px / 20px t.$font-family;
  cursor: pointer;
  &:focus { outline: none; }
  // 深色底上主綠色看不清楚，focus ring 改用同色系的成功色。
  &:focus-visible { outline: 2px solid t.$toast-success-accent; outline-offset: 2px; border-radius: t.$radius-pill; }
}

.delete-dialog-cancel { background: #f6f5f1; box-shadow: t.$shadow-raised; color: #636c65; }

.delete-dialog-confirm {
  background: t.$danger;
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}

@media (max-height: 600px) {
  .inventory-page { padding-bottom: t.$space-12; }
  .inventory-empty { gap: t.$space-16; }
}
</style>
