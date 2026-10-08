<script setup>
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ItemListRow from '../components/items/ItemListRow.vue'
import { useItemsStore } from '../stores/items'
import { CATEGORIES, STATUS, STATUS_LABELS } from '../models/item'
import statusCheckedIcon from '../assets/items/status-filter/checked.svg'
import statusPanel from '../assets/items/status-filter/panel.svg'
import overdueDot from '../assets/items/status-filter/overdue.svg'
import dueSoonDot from '../assets/items/status-filter/due-soon.svg'
import reminderOffDot from '../assets/items/status-filter/reminder-off.svg'
import shoppingListDot from '../assets/items/status-filter/shopping-list.svg'
import notNeededDot from '../assets/items/status-filter/not-needed.svg'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import chevronIcon from '../assets/settings/chevron.svg'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-in-shopping-list-plain.svg'

// Figma 原始搜尋 SVG；嵌入資料網址，避免依賴會過期的素材 URL。
const searchIcon = 'data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJJY29uIC8gU2VhcmNoIj4KPGNpcmNsZSBpZD0iRWxsaXBzZSIgY3g9IjgiIGN5PSI4IiByPSI1IiBzdHJva2U9IiM4Qjg4ODAiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBpZD0iVmVjdG9yIiBkPSJNMTMgMTNMMTcgMTciIHN0cm9rZT0iIzhCODg4MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8L3N2Zz4K'

const itemsStore = useItemsStore()
const { items, itemsWithStatus, spaces } = storeToRefs(itemsStore)

// 搜尋字串與空間選擇僅留在頁面層，不進 store、不持久化。
const searchQuery = ref('')
const selectedSpaceId = ref(null) // null = 所有用品
const spaceMenuOpen = ref(false)
const statusMenuOpen = ref(false)
const selectedStatuses = ref([])
const statusFilterButton = ref(null)
const statusPopover = ref(null)
const statusOptions = [
  { value: STATUS.OVERDUE, dot: overdueDot },
  { value: STATUS.DUE_SOON, dot: dueSoonDot },
  { value: STATUS.REMINDER_OFF, dot: reminderOffDot },
  { value: STATUS.IN_SHOPPING_LIST, dot: shoppingListDot },
  { value: STATUS.NOT_NEEDED, dot: notNeededDot },
]

function toggleStatus(status) {
  selectedStatuses.value = selectedStatuses.value.includes(status)
    ? selectedStatuses.value.filter((value) => value !== status)
    : [...selectedStatuses.value, status]
}

function closeStatusMenuOutside(event) {
  if (!statusMenuOpen.value) return
  if (statusFilterButton.value?.contains(event.target) || statusPopover.value?.contains(event.target)) return
  statusMenuOpen.value = false
}

// 浮層的陰影底圖比浮層寬，用 fixed 定位避免撐寬文件；依篩選按鈕位置換算座標。
const statusPopoverStyle = ref({})

function positionStatusPopover() {
  const button = statusFilterButton.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  statusPopoverStyle.value = {
    top: `${rect.bottom + 8}px`,
    right: `${document.documentElement.clientWidth - rect.right}px`,
  }
}

watch(statusMenuOpen, (open, _previous, onCleanup) => {
  if (!open) return
  positionStatusPopover()
  window.addEventListener('resize', positionStatusPopover)
  window.addEventListener('scroll', positionStatusPopover, { passive: true })
  onCleanup(() => {
    window.removeEventListener('resize', positionStatusPopover)
    window.removeEventListener('scroll', positionStatusPopover)
  })
})

// 左滑刪除的 UI state 僅留在頁面層，不進 store。
const revealedItemId = ref(null) // 同一時間只允許一列展開
const pendingDeleteItem = ref(null)
const isDeleteDialogOpen = ref(false)
const deleteDialog = ref(null)

const pendingDeleteSpaceName = computed(
  () => spaces.value.find((space) => space.id === pendingDeleteItem.value?.spaceId)?.name ?? '未指定空間',
)

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

// 只保留最近一次刪除的 Undo（不做 stack）；Toast 與 timer 僅留在頁面層。
const TOAST_DURATION_MS = 5000
const lastDeletedItem = ref(null)
const lastDeletedSpaceName = ref('')
const toastVisible = ref(false)
let toastTimer = null

function hideToast() {
  clearTimeout(toastTimer)
  toastTimer = null
  toastVisible.value = false
}

function showToast() {
  clearTimeout(toastTimer) // 新刪除取代舊 Toast，避免舊 timer 提早關閉
  toastVisible.value = true
  toastTimer = setTimeout(() => {
    toastTimer = null
    toastVisible.value = false
    lastDeletedItem.value = null // Toast 消失後刪除即定案，不再保留 snapshot
  }, TOAST_DURATION_MS)
}

function confirmDelete() {
  const target = pendingDeleteItem.value
  if (!target) return
  // 先建立與 store 脫鉤的完整 snapshot，再刪除。
  // 從 store 取原始 item（不含計算出的 status），toRaw 才能讓巢狀陣列也是非 Proxy，structuredClone 才不會失敗。
  const source = itemsStore.getItem(target.id)
  if (!source) {
    deleteDialog.value?.close()
    return
  }
  lastDeletedItem.value = structuredClone(toRaw(source))
  lastDeletedSpaceName.value = pendingDeleteSpaceName.value
  itemsStore.removeItem(target.id)
  revealedItemId.value = null
  deleteDialog.value?.close() // close 事件會清除 pendingDeleteItem
  showToast()
}

function undoDelete() {
  if (!lastDeletedItem.value) return
  // 保留原 id、spaceId、restockRecords、timestamps。
  // 傳入乾淨的複本，避免把 reactive Proxy 存進 store（否則之後再刪除時 structuredClone 會失敗）。
  itemsStore.addItem(structuredClone(toRaw(lastDeletedItem.value)))
  lastDeletedItem.value = null
  hideToast()
}

onUnmounted(() => clearTimeout(toastTimer))

function onDocumentPointerDown(event) {
  closeStatusMenuOutside(event)
  closeRevealedOutside(event)
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onUnmounted(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

const selectedSpaceName = computed(
  () => spaces.value.find((space) => space.id === selectedSpaceId.value)?.name ?? '所有用品',
)

const spaceOptions = computed(() => [{ id: null, name: '所有用品' }, ...spaces.value])

function filterBySpace(list, spaceId) {
  return spaceId === null ? list : list.filter((item) => item.spaceId === spaceId)
}

// 空間是主要瀏覽 context；切換時（含切回所有用品）重置搜尋，不保留「搜尋 AND 空間」。
function selectSpace(spaceId) {
  spaceMenuOpen.value = false
  // 重新點選同一空間只關閉浮層，不重置搜尋。
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

const spaceItems = computed(() =>
  sortByUrgency(filterBySpace(itemsWithStatus.value, selectedSpaceId.value)),
)
const selectedCategory = ref(null) // null = 全部；僅頁面層、單選、不持久化

function filterByCategory(list, category) {
  return category === null ? list : list.filter((item) => item.category === category)
}

function filterByStatus(list, statuses) {
  return statuses.length === 0 ? list : list.filter((item) => statuses.includes(item.status))
}

// 空間 scope AND 搜尋 AND 分類。
const categoryFilteredItems = computed(() =>
  filterByCategory(filterByName(spaceItems.value, searchQuery.value), selectedCategory.value),
)
const visibleItems = computed(() =>
  filterByStatus(categoryFilteredItems.value, selectedStatuses.value),
)

// 列表因篩選而不再包含展開列時，重置展開狀態。
watch(
  () => visibleItems.value.some((item) => item.id === revealedItemId.value),
  (stillVisible) => { if (!stillVisible) revealedItemId.value = null },
)

// 搜尋、分類、狀態屬於 filter；目前空間是 browsing context，不算 active filter。
const trimmedQuery = computed(() => searchQuery.value.trim())
const hasActiveFilter = computed(
  () => trimmedQuery.value !== '' || selectedCategory.value !== null || selectedStatuses.value.length > 0,
)

// 0 筆結果的三種狀態互斥，依優先順序判斷：
// general（完全沒有用品）→ space（此空間沒有用品且無 filter）→ noResults（filter 後 0 筆）。
const emptyState = computed(() => {
  if (items.value.length === 0) return 'general'
  if (!hasActiveFilter.value && spaceItems.value.length === 0) return 'space'
  if (hasActiveFilter.value && visibleItems.value.length === 0) return 'noResults'
  return null
})

// 清除搜尋、分類、狀態；保留目前空間。
function clearFilters() {
  searchQuery.value = ''
  selectedCategory.value = null
  selectedStatuses.value = []
}

const categoryPills = ref(null)
const showCategoryFade = ref(false)
const showLeftCategoryFade = ref(false)

function updateCategoryFade() {
  const element = categoryPills.value
  showLeftCategoryFade.value = !!element && element.scrollWidth - element.clientWidth > 1 && element.scrollLeft > 1
  showCategoryFade.value = !!element && element.scrollWidth - element.clientWidth - element.scrollLeft > 1
}

// 桌機滑鼠滾輪只會垂直捲動；在 pills 上把垂直滾輪轉成橫向捲動。
// 已到邊界或無法橫向捲動時不攔截，讓頁面照常垂直捲動。
function onCategoryWheel(event) {
  const element = categoryPills.value
  if (!element || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const maxScroll = element.scrollWidth - element.clientWidth
  const atStart = element.scrollLeft <= 0 && event.deltaY < 0
  const atEnd = element.scrollLeft >= maxScroll - 1 && event.deltaY > 0
  if (maxScroll <= 1 || atStart || atEnd) return
  event.preventDefault()
  element.scrollLeft += event.deltaY
}

watch(categoryPills, (element, _previous, onCleanup) => {
  updateCategoryFade()
  if (!element) return

  // 視窗尺寸或字體載入改變分類寬度時，也重新判斷兩側是否還有內容。
  const observer = new ResizeObserver(updateCategoryFade)
  observer.observe(element)
  for (const pill of element.children) observer.observe(pill)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
</script>

<template>
  <section class="inventory-page" aria-labelledby="inventory-title">
    <div class="inventory-sticky-header">
      <header class="inventory-header">
        <div class="inventory-heading">
          <div class="inventory-title-row">
            <h1 id="inventory-title">{{ selectedSpaceId === null ? '所有用品' : selectedSpaceName }}</h1>
            <button
              type="button"
              class="space-chevron"
              :aria-expanded="spaceMenuOpen"
              aria-haspopup="listbox"
              aria-label="切換空間"
              @click="spaceMenuOpen = !spaceMenuOpen"
            >
              <img :src="chevronIcon" alt="" />
            </button>
          </div>
          <p class="inventory-subtitle">共 {{ spaceItems.length }} 項用品</p>
        </div>
        <img class="profile-avatar" :src="profile.avatar || defaultAvatar" alt="個人頭像" />

        <!-- Space Popover：浮層，不推動下方版面。 -->
        <template v-if="spaceMenuOpen">
          <div class="space-popover-backdrop" @click="spaceMenuOpen = false" />
          <div class="space-popover" role="listbox" aria-label="空間切換">
            <button
              v-for="option in spaceOptions"
              :key="option.id ?? 'all'"
              type="button"
              role="option"
              class="space-option"
              :class="{ 'space-option--selected': selectedSpaceId === option.id }"
              :aria-selected="selectedSpaceId === option.id"
              @click="selectSpace(option.id)"
            >
              <span>{{ option.name }}</span>
              <svg v-if="selectedSpaceId === option.id" class="space-check" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <div class="space-popover-divider" />
            <!-- 視覺入口；本階段尚未提供新增空間流程。 -->
            <button type="button" class="space-option space-action" aria-disabled="true">
              <svg class="space-plus" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
              <span>新增空間</span>
            </button>
          </div>
        </template>
      </header>

      <template v-if="items.length">
        <!-- 搜尋已啟用；狀態篩選尚未啟用。 -->
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
          <button
            ref="statusFilterButton"
            type="button"
            class="status-filter-button"
            aria-label="狀態篩選"
            :aria-expanded="statusMenuOpen"
            aria-controls="status-filter-popover"
            @click="statusMenuOpen = !statusMenuOpen"
          >
            <span class="filter-icon" aria-hidden="true"><span /><span /><span /></span>
            <span v-if="selectedStatuses.length" class="status-badge" aria-hidden="true">{{ selectedStatuses.length }}</span>
          </button>
          <div
            v-if="statusMenuOpen"
            id="status-filter-popover"
            ref="statusPopover"
            class="status-popover"
            :style="statusPopoverStyle"
            role="group"
            aria-labelledby="status-filter-title"
            @keydown.esc.stop="statusMenuOpen = false; statusFilterButton?.focus()"
          >
            <img class="status-panel-background" :src="statusPanel" alt="" aria-hidden="true" />
            <div class="status-popover-panel">
              <p id="status-filter-title" class="status-popover-title">狀態篩選・已選 {{ selectedStatuses.length }} 項</p>
              <div class="status-options">
                <button
                  v-for="option in statusOptions"
                  :key="option.value"
                  type="button"
                  class="status-option"
                  role="checkbox"
                  :aria-checked="selectedStatuses.includes(option.value)"
                  @click="toggleStatus(option.value)"
                >
                  <span class="status-checkbox" :class="{ 'status-checkbox--checked': selectedStatuses.includes(option.value) }" aria-hidden="true">
                    <img v-if="selectedStatuses.includes(option.value)" :src="statusCheckedIcon" alt="" />
                  </span>
                  <img class="status-dot" :src="option.dot" alt="" />
                  <span>{{ STATUS_LABELS[option.value] }}</span>
                </button>
              </div>
              <div class="status-popover-divider" />
              <div class="status-clear-action">
                <button type="button" class="status-clear" @click="selectedStatuses = []">清除篩選</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Phase 1 僅呈現分類；切換與篩選留待 Phase 2。 -->
        <div
          class="category-strip"
          :class="{
            'category-strip--has-more': showCategoryFade,
            'category-strip--has-previous': showLeftCategoryFade,
          }"
        >
          <ul ref="categoryPills" class="category-pills" aria-label="用品分類" @scroll.passive="updateCategoryFade" @wheel="onCategoryWheel">
            <li>
              <button
                type="button"
                class="category-pill"
                :class="{ 'category-pill--selected': selectedCategory === null }"
                :aria-pressed="selectedCategory === null"
                @click="selectedCategory = null"
              >全部</button>
            </li>
            <li v-for="category in CATEGORIES" :key="category">
              <button
                type="button"
                class="category-pill"
                :class="{ 'category-pill--selected': selectedCategory === category }"
                :aria-pressed="selectedCategory === category"
                @click="selectedCategory = category"
              >{{ category }}</button>
            </li>
          </ul>
        </div>
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
    </div>

    <ul v-else-if="emptyState === null" class="item-list" aria-label="我的用品列表">
      <ItemListRow
        v-for="item in visibleItems"
        :key="item.id"
        :item="item"
        :spaces="spaces"
        :revealed="revealedItemId === item.id"
        @reveal="revealedItemId = item.id"
        @close="revealedItemId = null"
        @delete="openDeleteDialog"
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
      <!-- 視覺入口；本階段尚未提供新增流程。 -->
      <button type="button" class="btn btn-primary empty-add" aria-disabled="true">
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
        <h2 id="delete-dialog-title">刪除「{{ pendingDeleteItem.name }}」？</h2>
        <p id="delete-dialog-desc">刪除後，這項用品會從「{{ pendingDeleteSpaceName }}」空間移除。</p>
        <div class="delete-dialog-actions">
          <button type="button" class="delete-dialog-cancel" @click="deleteDialog.close()">取消</button>
          <button type="button" class="delete-dialog-confirm" @click="confirmDelete">刪除</button>
        </div>
      </template>
    </dialog>

    <!-- 刪除成功 Toast：Bottom Nav 上方水平置中。 -->
    <div v-if="toastVisible && lastDeletedItem" class="delete-toast" role="status" aria-live="polite">
      <svg class="toast-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M5.8 10.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="toast-message">已從「{{ lastDeletedSpaceName }}」移除 {{ lastDeletedItem.name }}</span>
      <button type="button" class="toast-undo" @click="undoDelete">復原</button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

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
  padding-bottom: t.$space-8;
  background: t.$bg-main;
}

.inventory-header,
.inventory-toolbar,
.category-strip {
  flex-shrink: 0;
}

.inventory-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$space-16;
  min-height: 52px;
}

.inventory-heading { min-width: 0; }

.space-popover-backdrop { position: fixed; inset: 0; z-index: 1; }

.space-popover {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 9px;
  border: 1px solid t.$border-color;
  border-radius: 22px;
  background: t.$card-bg;
  box-shadow: 0 -3px 10px rgba(255, 255, 255, .4), 0 10px 28px rgba(140, 136, 127, .14);
}

.space-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  width: 100%;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 15px / normal t.$font-family;
  text-align: left;
  cursor: pointer;

  &--selected {
    background: t.$active-green;
    box-shadow: inset -1px -1px 4px rgba(255, 255, 255, .85), inset 1px 2px 5px rgba(138, 158, 136, .1);
    color: t.$primary-green;
    font-weight: t.$font-weight-bold;
  }
}

.space-check, .space-plus { flex: 0 0 18px; width: 18px; height: 18px; }

.space-popover-divider { height: 1px; margin-block: 4px; background: t.$border-color; }

.space-action {
  justify-content: flex-start;
  color: t.$primary-green;
  cursor: default;
}
.inventory-title-row { display: flex; align-items: center; gap: t.$space-8; }

h1 {
  margin: 0;
  color: t.$text-main;
  font: t.$font-weight-bold #{t.$font-size-page-title} / #{t.$line-height-page-title} t.$font-family;
  letter-spacing: 0;
}

.space-chevron {
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  padding: 0;
  border: 0;
  color: inherit;
  cursor: pointer;
  img { transform: rotate(90deg); }
}

.inventory-subtitle { margin: 2px 0 0; color: t.$text-sub; font-size: t.$font-size-metadata; line-height: 18px; }

.profile-avatar {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: t.$radius-pill;
  object-fit: cover;
  box-shadow: t.$shadow-raised;
}

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

.status-filter-button {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-main;
  cursor: pointer;
}

.inventory-toolbar { position: relative; }

.status-popover {
  // top / right 由 script 依篩選按鈕位置設定。
  position: fixed;
  z-index: 3;
  width: 250px;
  height: 342px;
}

.status-panel-background {
  position: absolute;
  top: -18.5px;
  left: -28px;
  pointer-events: none;
}

.status-popover-panel {
  position: relative;
  top: 10px;
  display: flex;
  flex-direction: column;
  padding: 9px;
  border-radius: t.$radius-popover;
}

.status-popover-title {
  margin: 0;
  padding: 6px 12px;
  color: t.$text-button-secondary;
  font: t.$font-weight-medium 14px / normal t.$font-family;
}

.status-options { display: flex; flex-direction: column; height: 235px; }

.status-option {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
  width: 100%;
  height: 46px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 15px / normal t.$font-family;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.status-checkbox {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border: 1.5px solid #a9a59b;
  border-radius: 10px;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;

  &--checked { border: 0; background: transparent; box-shadow: none; }
  img { display: block; }
}

.status-dot { display: block; flex: 0 0 8px; }
.status-popover-divider { height: 1px; background: #edeae3; }
.status-clear-action { display: flex; justify-content: center; }

.status-clear {
  width: 78px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: transparent;
  color: t.$primary-green;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  white-space: nowrap;
  cursor: pointer;
}

.status-filter-button { position: relative; }

// 附著在按鈕右上角，絕對定位，不影響按鈕尺寸與 Tools Row 版面。
.status-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 5px;
  border-radius: t.$radius-pill;
  background: t.$primary-green;
  color: t.$text-inverse;
  font: t.$font-weight-medium 11px / 1 t.$font-family;
  pointer-events: none;
}

.filter-icon {
  position: relative;
  display: block;
  width: 20px;
  height: 20px;
  span { position: absolute; height: 2px; border-radius: 1px; background: currentColor; }
  span:nth-child(1) { top: 4px; left: 2px; width: 16px; }
  span:nth-child(2) { top: 9px; left: 5px; width: 10px; }
  span:nth-child(3) { top: 14px; left: 8px; width: 4px; }
}

.category-strip {
  position: relative;
  min-width: 0;
  // 對包含陰影的整個捲動區淡出，避免額外覆蓋層的硬切邊。
  &--has-more .category-pills {
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
  }
  &--has-previous .category-pills {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 32px);
    mask-image: linear-gradient(to right, transparent, #000 32px);
  }
  &--has-previous.category-strip--has-more .category-pills {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
  }
}

.category-pills {
  display: flex;
  gap: t.$space-8;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  margin: -16px 0;
  padding: 16px 4px 16px 4px;
  list-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.category-pills > li { flex-shrink: 0; }

.category-pill {
  border: 0;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 36px;
  padding-inline: 14px;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-sub;
  font-size: t.$font-size-body-sm;
  line-height: 20px;
  white-space: nowrap;
}

.category-pill--selected { background: t.$primary-green; box-shadow: t.$shadow-primary; color: t.$text-inverse; font-weight: t.$font-weight-medium; }

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
  gap: t.$space-8;
  box-sizing: border-box;
  width: min(358px, calc(100vw - 32px));
  padding: t.$space-12 10px t.$space-12 14px;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: 0 -2px 8px rgba(255, 255, 255, .8), 0 8px 24px rgba(140, 136, 127, .36), 0 2px 6px rgba(107, 102, 92, .2);
  transform: translateX(-50%);
}

.toast-icon { flex: 0 0 20px; width: 20px; height: 20px; color: t.$primary-green; }

.toast-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: t.$text-main;
  font: t.$font-weight-medium 14px / 20px t.$font-family;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-undo {
  flex-shrink: 0;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: t.$primary-green;
  font: t.$font-weight-medium 14px / 20px t.$font-family;
  cursor: pointer;
  &:focus { outline: none; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: t.$radius-pill; }
}

.delete-dialog-cancel { background: #f6f5f1; box-shadow: t.$shadow-raised; color: #636c65; }

.delete-dialog-confirm {
  background: t.$danger;
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}

@media (max-height: 600px) {
  .inventory-page { padding-top: t.$space-16; padding-bottom: t.$space-12; }
  .inventory-empty { gap: t.$space-16; }
}
</style>
