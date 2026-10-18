<script setup>
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import SpacePill from '../components/SpacePill.vue'
import CategoryPills from '../components/CategoryPills.vue'
import AppToast from '../components/AppToast.vue'
import AddSpaceSheet from '../components/add-item/AddSpaceSheet.vue'
import RestockItemGrid from '../components/restock/RestockItemGrid.vue'
import RestockSelectedList from '../components/restock/RestockSelectedList.vue'
import RestockDateBar from '../components/restock/RestockDateBar.vue'
import { useToast } from '../composables/useToast'
import { useItemsStore } from '../stores/items'
import { useCatalogStore } from '../stores/catalog'
import { useRestockDraftStore } from '../stores/restockDraft'
import { DEFAULT_SPACE_ID, ITEM_STATUS, getLatestRecord } from '../models/item'
import { getItemCategory } from '../models/itemCategories'
import { getItemIconSrc } from '../assets/household-icons-by-state/index.js'
import backIcon from '../assets/add-item/back-chevron.svg'

// 記錄補貨頁（原「新增補貨紀錄」，UT-37 改名；specs/009 FR-901～FR-908）：選用品、調數量、選日期，按「記錄」。
const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const catalog = useCatalogStore()
const draft = useRestockDraftStore()
const { spaces, today } = storeToRefs(itemsStore)

// 記錄成功後會回到上一頁，Toast 要跟得過去，所以用 App 層的；頁內的提示（新增用品、新增空間）用頁面自己的。
const appToast = inject('appToast', null)
const { toast, showToast } = useToast()

// ---------- 狀態（FR-908：從用品管理／新增用品返回時還原） ----------
const spaceExists = (id) => spaces.value.some((space) => space.id === id)
// 只有「從用品管理、新增用品返回」才還原：留著暫存旗標，而且這一筆歷史紀錄後面還有頁面（history.state.forward）。
const restoring = draft.keep && !!window.history.state?.forward

const selected = ref([]) // [{ id, quantity }]，id 是全域用品 id
const date = ref(today.value)
const spaceId = ref(spaceExists(route.query.space) ? route.query.space : DEFAULT_SPACE_ID)
const category = ref(null) // null = 全部

if (restoring) {
  // 已被刪除的用品從已選清單剔除；隔天才返回時日期重設為今天。
  selected.value = draft.selected.filter((entry) => catalog.getById(entry.id)).map((entry) => ({ ...entry }))
  date.value = draft.savedOn === today.value && draft.date ? draft.date : today.value
  if (spaceExists(draft.spaceId)) spaceId.value = draft.spaceId
  category.value = draft.category
}
draft.reset()

// ---------- 用品格子與類別 ----------
const catalogItems = computed(() => catalog.allItems)
// 只列清單中至少有一項用品的類別；系統分類加使用者自訂分類，來源 categoryOptions。
const categories = computed(() =>
  itemsStore.categoryOptions.filter((name) => catalogItems.value.some((item) => getItemCategory(item) === name)),
)
watch(categories, (names) => {
  if (category.value !== null && !names.includes(category.value)) category.value = null
})
const visibleItems = computed(() =>
  category.value === null ? catalogItems.value : catalogItems.value.filter((item) => getItemCategory(item) === category.value),
)
const selectedIds = computed(() => selected.value.map((entry) => entry.id))

function toggleItem(id) {
  if (lockedClaims.value[id]) return
  const index = selected.value.findIndex((entry) => entry.id === id)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push({ id, quantity: 1 })
}

function setQuantity(id, quantity) {
  const entry = selected.value.find((item) => item.id === id)
  if (entry) entry.quantity = Math.min(99, Math.max(1, quantity))
}

function removeItem(id) {
  selected.value = selected.value.filter((entry) => entry.id !== id)
}

// ---------- 共享清單的認領規則（UT-40、FR-915） ----------
// 被其他成員認領的用品：以目前所選空間與全域用品配對；個人空間、不在清單、尚未認領或自己認領的都不會出現。
const lockedClaims = computed(() => {
  const locked = {}
  for (const item of catalogItems.value) {
    const claim = itemsStore.getClaimInfo(findSpaceItem(item.id))
    if (claim?.state === 'other') locked[item.id] = claim.name
  }
  return locked
})
function onBlockedTile(id) {
  const item = catalog.getById(id)
  if (item && lockedClaims.value[id]) showToast(`${lockedClaims.value[id]}已認領「${item.name}」，請先到購買清單接手認領`, null, '復原', 'error')
}

// ---------- 已選清單 ----------
// 以 (空間, catalogId) 找空間用品；舊資料關聯有歧義時 Store 會丟錯，這裡視為沒有紀錄可顯示。
function findSpaceItem(catalogId) {
  try {
    return itemsStore.getItemByCatalogId(spaceId.value, catalogId)
  } catch {
    return null
  }
}

function formatMonthDay(dateString) {
  const [, month, day] = dateString.split('-').map(Number)
  return `${month}/${day}`
}

// 該空間已有這個用品且有補貨紀錄時，顯示最新一筆的日期；沒有就不顯示。
const entries = computed(() =>
  selected.value.flatMap((entry) => {
    const item = catalog.getById(entry.id)
    if (!item) return []
    const latest = getLatestRecord(findSpaceItem(item.id)?.restockRecords ?? [])
    return [{
      id: item.id,
      name: item.name,
      unit: item.unit,
      icon: getItemIconSrc(item, ITEM_STATUS.IN_STOCK),
      quantity: entry.quantity,
      lastDate: latest ? formatMonthDay(latest.date) : null,
    }]
  }),
)

const recordLabel = computed(() => (selected.value.length > 1 ? `記錄 ${selected.value.length} 項` : '記錄'))

// ---------- 新增空間 ----------
const addSpaceOpen = ref(false)
function onSpaceCreated(space) {
  spaceId.value = space.id
  showToast('已成功新增空間')
}

// ---------- 「⋯」選單 ----------
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
function openItemManagement() {
  closeMore()
  router.push({ name: 'item-management', query: { from: 'restock' } })
}

function openNewItem() {
  // 目前選了類別 pills 時，新增用品頁預設同一個類別（選「全部」就不預設）。
  router.push({ name: 'add-item', query: category.value ? { category: category.value } : {} })
}

// 從新增用品頁返回：全域用品剛新增完，自動選好並提示（FR-909）。
onMounted(() => {
  const id = catalog.justAddedId
  if (!id) return
  catalog.clearJustAddedId()
  const item = catalog.getById(id)
  if (!item) return
  category.value = null
  if (!selectedIds.value.includes(id)) selected.value.push({ id, quantity: 1 })
  showToast(`已新增用品「${item.name}」`)
})

// ---------- 返回與放棄（FR-908） ----------
const discardDialog = ref(null)
let allowLeave = false
let pendingRoute = null

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'inventory' })
}

const KEEP_DRAFT_ROUTES = ['item-management', 'add-item']

onBeforeRouteLeave((to) => {
  if (allowLeave) return true
  // 去用品管理或新增用品：暫存目前內容，返回時還原。
  if (KEEP_DRAFT_ROUTES.includes(to.name)) {
    draft.save({ selected: selected.value, date: date.value, spaceId: spaceId.value, category: category.value }, today.value)
    return true
  }
  if (!selected.value.length) return true
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

// ---------- 記錄（FR-907） ----------
let recording = false

function record() {
  if (recording || !selected.value.length) return
  const batchEntries = selected.value.flatMap((entry) => {
    const item = catalog.getById(entry.id)
    if (!item) return []
    return [{ catalogId: item.id, quantity: entry.quantity }]
  })
  if (!batchEntries.length) return
  recording = true

  const batch = itemsStore.recordRestockBatch(batchEntries, { spaceId: spaceId.value, date: date.value })
  if (!batch.ok) {
    // 整批已復原，留在頁面讓使用者調整。
    recording = false
    showToast(batch.error.message, null, '復原', 'error')
    return
  }
  const { results, undo } = batch
  const first = results[0]
  const message = results.length > 1
    ? `已記錄 ${results.length} 項`
    : first.startedInferring ? '已記錄，下次補貨日已推算' : `已記錄「${first.name}」${first.quantity} ${first.unit}`

  allowLeave = true
  draft.reset()
  // 上一頁是「我的用品」且篩選的空間與剛記錄的不同時，切到剛記錄的空間（UT-29）。
  if (window.history.state?.back === '/inventory') itemsStore.inventorySpaceId = spaceId.value
  if (window.history.state?.back) router.back()
  else {
    itemsStore.inventorySpaceId = spaceId.value
    router.replace({ name: 'inventory' })
  }
  if (appToast) appToast.showToast(message, undo)
  else showToast(message, undo)
}
</script>

<template>
  <section class="restock-page" aria-labelledby="restock-title">
    <header class="restock-header">
      <button type="button" class="icon-button" aria-label="返回" @click="goBack">
        <img :src="backIcon" alt="" />
      </button>
      <div class="restock-header-center">
        <h1 id="restock-title" class="visually-hidden">記錄補貨</h1>
        <SpacePill v-model="spaceId" :spaces="spaces" @add-space="addSpaceOpen = true" />
      </div>
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
        </div>
      </template>
    </header>

    <CategoryPills v-model="category" :categories="categories" />

    <div class="restock-stage">
      <RestockItemGrid :items="visibleItems" :selected-ids="selectedIds" :locked="lockedClaims" @toggle="toggleItem" @blocked="onBlockedTile" @new-item="openNewItem" />
    </div>

    <div class="restock-sheet">
      <RestockSelectedList :entries="entries" @update:quantity="setQuantity" @remove="removeItem" />
      <RestockDateBar v-model="date" :today="today" />
      <button type="button" class="btn btn-primary record-button" :disabled="!selected.length" @click="record">{{ recordLabel }}</button>
    </div>

    <AddSpaceSheet :open="addSpaceOpen" @close="addSpaceOpen = false" @created="onSpaceCreated" />
    <AppToast :toast="toast" placement="top" />

    <!-- 放棄確認；樣式同新增用品頁、我的用品刪除確認。 -->
    <dialog ref="discardDialog" class="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-desc" @close="pendingRoute = null">
      <h2 id="discard-title">放棄補貨紀錄？</h2>
      <p id="discard-desc">你選的用品尚未記錄，離開後將不會保留。</p>
      <div class="discard-actions">
        <button type="button" class="discard-cancel" @click="discardDialog.close()">取消</button>
        <button type="button" class="discard-confirm" @click="discard">放棄</button>
      </div>
    </dialog>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.restock-page {
  // 整頁滿版到底：App 容器底部有 34px 內距，這裡抵銷，底部面板才貼齊畫面下緣。
  width: 100%;
  max-width: 358px;
  height: 100dvh;
  margin-inline: auto;
  margin-bottom: -34px;
  padding-top: t.$space-16;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  color: t.$text-main;
  font-family: t.$font-family;
  text-align: left;
}

// 頁首：返回、空間膠囊（中間）、「⋯」，左右對稱。
.restock-header {
  position: relative;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  gap: t.$space-8;
  height: 48px;
}

.restock-header-center { min-width: 0; display: flex; justify-content: center; }

.icon-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-main;
  cursor: pointer;
  img { display: block; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}

.more-backdrop { position: fixed; inset: 0; z-index: 1; }

.more-popover {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 2;
  width: 200px;
  padding: 8px;
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
}

// 用品格子：自己捲動，底部面板固定在下面。左右留 4px 讓選取外框不被裁切。
.restock-stage {
  flex: 1;
  min-height: 0;
  margin-inline: -4px;
  padding: 0 4px 12px;
  overflow-y: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

// 下段：已選清單、日期條、記錄按鈕。滿版（抵銷 App 容器左右 16px）。
.restock-sheet {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: t.$space-12;
  margin-inline: -16px;
  padding: t.$space-16 t.$space-16 30px;
  border-radius: 28px 28px 0 0;
  background: t.$card-bg;
  box-shadow: t.$shadow-floating;
}

.record-button {
  width: 100%;
  min-height: 52px;
  border-radius: 26px;
  font: t.$font-weight-bold t.$font-size-button / normal t.$font-family;

  // 選 0 項時為灰色不可按（FR-907）。
  &:disabled { background: t.$border-active; box-shadow: none; color: t.$text-inverse; cursor: not-allowed; opacity: 1; }
}

// ---------- 放棄 Dialog（同 AddItemView .discard-dialog）----------
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
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.discard-cancel { background: t.$input-bg; box-shadow: t.$shadow-raised; color: t.$text-button-secondary; }
.discard-confirm {
  background: t.$danger;
  box-shadow: -3px -3px 6px rgba(249, 249, 249, .4), 4px 5px 10px rgba(42, 74, 39, .4), inset 1.5px 2px 3px rgba(31, 58, 29, .35), inset -1.5px -1.5px 3px rgba(255, 255, 255, .15);
  color: t.$text-inverse;
}
</style>
