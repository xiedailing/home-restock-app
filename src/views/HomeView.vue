<script setup>
// 首頁（specs/004-home）。Figma：[Current] 首頁V3 / Mobile（692:5011）一般狀態 693:3575、多選 693:3838、Empty State 1198:9734。
// 「最近更新」卡目前固定為空狀態（HOME-09）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { SNOOZE_DAYS } from '../models/item'
import { useToast } from '../composables/useToast'
import { bottomNavHiddenByPage } from '../composables/useBottomNav'
import AppToast from '../components/AppToast.vue'
import ProfileAvatarMenu from '../components/ProfileAvatarMenu.vue'
import ShoppingSummaryCard from '../components/home/ShoppingSummaryCard.vue'
import RecentUpdateCard from '../components/home/RecentUpdateCard.vue'
import ReminderCard from '../components/home/ReminderCard.vue'
import RestockSheet from '../components/item-detail/RestockSheet.vue'
import emptyIcon from '../assets/household-icons-by-state/common/generic-item-in-stock.svg'

const router = useRouter()
const itemsStore = useItemsStore()
const { restockReminders, shoppingList, spaces } = storeToRefs(itemsStore)
const { toast, showToast, runUndo } = useToast()

// 最近更新卡：最近一筆自己完成的購買；與購買清單「已補貨」區同樣只保留 24 小時（HOME-11）。
const COMPLETED_KEEP_MS = 24 * 60 * 60 * 1000
const now = ref(Date.now())
let expiryTimer
const recentItem = computed(() =>
  itemsStore.items
    .filter((item) => item.shoppingCompletedAt != null && item.shoppingCompletedBy === 'self' && now.value - item.shoppingCompletedAt < COMPLETED_KEEP_MS)
    .sort((a, b) => b.shoppingCompletedAt - a.shoppingCompletedAt)[0] ?? null,
)
// 到期時重新判斷，卡片自動回到空狀態；回到分頁時也重算。
function refreshNow() {
  clearTimeout(expiryTimer)
  now.value = Date.now()
  if (recentItem.value) expiryTimer = setTimeout(refreshNow, recentItem.value.shoppingCompletedAt + COMPLETED_KEEP_MS - now.value)
}
watch(() => itemsStore.items.map((item) => item.shoppingCompletedAt), refreshNow)
onMounted(() => { refreshNow(); document.addEventListener('visibilitychange', refreshNow) })
onUnmounted(() => { clearTimeout(expiryTimer); document.removeEventListener('visibilitychange', refreshNow) })

// 待買卡只算「我的清單」待買：個人用品＋自己認購的共享用品，與購買清單「全部補貨」範圍一致（HOME-12）。
const myShoppingList = computed(() =>
  shoppingList.value.filter((item) => !spaces.value.find((space) => space.id === item.spaceId)?.shared || item.shoppingClaimantId === 'self'),
)

const spaceName = (spaceId) => spaces.value.find((space) => space.id === spaceId)?.name ?? '未指定空間'

function openItemDetail(item) {
  router.push({ name: 'item-detail', params: { id: item.id } })
}

// 同時只開一個「⋯」選單。
const menuItemId = ref(null)
function toggleMenu(item) {
  menuItemId.value = menuItemId.value === item.id ? null : item.id
}

// FR-403：加入後狀態變「購買清單中」，卡片從補貨提醒移除；Toast「查看」前往購買清單。
function addToShoppingList(item) {
  itemsStore.addToShoppingList(item.id)
  showToast('已加入購買清單', () => router.push({ name: 'shopping' }), '查看')
}

// specs/005 FR-502：延後 7 天，卡片移除；復原還原整筆用品，卡片依排序回到原位置。
function snooze(item) {
  const snapshot = itemsStore.snapshotItem(item.id)
  itemsStore.snoozeReminder(item.id)
  showToast(`已延後提醒，${SNOOZE_DAYS} 天後再提醒`, () => itemsStore.restoreItem(snapshot))
}

// FR-404：記錄補貨同 003 FR-306；復原還原整筆用品，卡片依排序回到原位置。
// FR-405：多選時隱藏 Bottom Nav，離開首頁一併恢復。
const selecting = ref(false)
const selectedIds = ref([])
// 只計算仍在補貨提醒中的勾選項目。
const selectedReminderIds = computed(() =>
  restockReminders.value.filter((item) => selectedIds.value.includes(item.id)).map((item) => item.id),
)
watch(selecting, (value) => { bottomNavHiddenByPage.value = value })
onUnmounted(() => { bottomNavHiddenByPage.value = false })

function startSelecting() {
  menuItemId.value = null
  selectedIds.value = []
  selecting.value = true
}
function stopSelecting() {
  selecting.value = false
  selectedIds.value = []
}
function toggleSelected(item) {
  selectedIds.value = selectedIds.value.includes(item.id)
    ? selectedIds.value.filter((id) => id !== item.id)
    : [...selectedIds.value, item.id]
}
function addSelectedToShoppingList() {
  const ids = selectedReminderIds.value
  if (!ids.length) return
  itemsStore.addManyToShoppingList(ids)
  stopSelecting()
  showToast(`已加入 ${ids.length} 項到購買清單`, () => router.push({ name: 'shopping' }), '查看')
}

const restockItem = ref(null)
function onRestockConfirm(restock) {
  const snapshot = itemsStore.snapshotItem(restockItem.value.id)
  itemsStore.completeRestock(restockItem.value.id, restock)
  showToast('已記錄補貨', () => itemsStore.restoreItem(snapshot))
}
</script>

<template>
  <section class="home-page" :class="{ 'home-page--selecting': selecting }" aria-labelledby="home-title">
    <div class="home-top">
      <header class="home-header">
        <div>
          <h1 id="home-title">補補</h1>
          <p class="home-subtitle">所有空間的補貨總覽</p>
        </div>
        <ProfileAvatarMenu :to="{ name: 'edit-profile' }" />
      </header>
      <div class="summary-row">
        <ShoppingSummaryCard :items="myShoppingList" />
        <RecentUpdateCard :item="recentItem" />
      </div>
    </div>

    <section class="reminder-section" aria-labelledby="reminder-title">
      <div class="section-header">
        <h2 id="reminder-title">補貨提醒</h2>
        <span v-if="restockReminders.length" class="reminder-badge">{{ restockReminders.length }} 項該補貨</span>
        <span v-if="selecting" class="selected-count" aria-live="polite">已選 {{ selectedReminderIds.length }} 項</span>
        <button v-else-if="restockReminders.length" type="button" class="select-button" @click="startSelecting">多選</button>
      </div>

      <ul v-if="restockReminders.length" class="reminder-list" aria-label="補貨提醒列表">
        <li v-for="item in restockReminders" :key="item.id">
          <ReminderCard
            :item="item"
            :space-name="spaceName(item.spaceId)"
            :menu-open="menuItemId === item.id"
            :selecting="selecting"
            :selected="selectedIds.includes(item.id)"
            @open="openItemDetail(item)"
            @add-to-list="addToShoppingList(item)"
            @toggle-menu="toggleMenu(item)"
            @close-menu="menuItemId = null"
            @restock="restockItem = item"
            @snooze="snooze(item)"
            @toggle-select="toggleSelected(item)"
          />
        </li>
      </ul>

      <div v-else class="reminder-empty" role="status">
        <span class="empty-illustration" aria-hidden="true"><img :src="emptyIcon" alt="" /></span>
        <div class="empty-copy">
          <h3>目前沒有需要補貨的用品</h3>
          <p>有新的提醒時會出現在這裡</p>
        </div>
        <!-- Bottom Nav 已有新增入口；只有完全沒有用品時才放，給第一次使用的人（HOME-12）。 -->
        <RouterLink v-if="!itemsStore.items.length" class="btn btn-primary empty-add" :to="{ name: 'add-item' }">
          <span class="add-symbol" aria-hidden="true">＋</span>
          新增用品
        </RouterLink>
      </div>
    </section>

    <div v-if="selecting" class="select-action-bar">
      <button type="button" class="btn btn-secondary action-cancel" @click="stopSelecting">取消</button>
      <button
        type="button"
        class="btn btn-primary action-confirm"
        :disabled="!selectedReminderIds.length"
        @click="addSelectedToShoppingList"
      >
        加入清單（{{ selectedReminderIds.length }} 項）
      </button>
    </div>

    <RestockSheet
      :open="!!restockItem"
      :unit="restockItem?.unit ?? ''"
      :reminder-enabled="!!restockItem?.reminderEnabled"
      @confirm="onRestockConfirm"
      @close="restockItem = null"
    />
    <AppToast :toast="toast" @undo="runUndo" />
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/page-header' as ph;

.home-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-top: t.$space-16;
  display: flex;
  flex-direction: column;
  gap: t.$space-24;
  color: t.$text-main;
  font-family: t.$font-family;
  letter-spacing: 0;
  text-align: left;
}
.home-top { display: flex; flex-direction: column; gap: t.$space-16; }
// Figma Top Summary Row（705:4342）：待買 212＋最近更新 132，間距 14。
.summary-row { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 14px; }
// 下方間距由 .home-top 的 gap 提供。
.home-header { @include ph.page-header(0); }
h1 { @include ph.page-title; }
.home-subtitle { @include ph.page-subtitle; }

.reminder-section { display: flex; flex-direction: column; gap: 25px; padding-top: t.$space-4; }
.section-header { display: flex; align-items: center; gap: 10px; min-height: 24px; }
h2 { margin: 0; color: #2b2a26; font: t.$font-weight-bold t.$font-size-heading / normal t.$font-family; }
.reminder-badge {
  padding: t.$space-4 10px;
  border-radius: t.$radius-pill;
  background: #fff1e8;
  color: #c75a24;
  font: t.$font-weight-bold t.$font-size-caption / normal t.$font-family;
  white-space: nowrap;
}
.selected-count,
.select-button {
  margin-left: auto;
  color: t.$primary-green;
  font: t.$font-weight-bold t.$font-size-body-sm / normal t.$font-family;
  white-space: nowrap;
}
.select-button {
  padding: t.$space-4 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; border-radius: 4px; }
}
.reminder-list { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 0; list-style: none; }

// Figma Soft Bottom Action Bar（693:4149）：358×72，固定在底部手勢區上方；取代 Bottom Nav。
.select-action-bar {
  position: fixed;
  bottom: 34px;
  left: 50%;
  z-index: 1000;
  box-sizing: border-box;
  display: flex;
  gap: 10px;
  width: min(358px, calc(100% - 32px));
  padding: 12px 11px;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: t.$shadow-floating;
  transform: translateX(-50%);
}
.action-cancel { flex: 0 0 104px; height: t.$button-height; font-size: t.$font-size-button; }
.action-confirm { flex: 1; height: t.$button-height; font-size: t.$font-size-button; }
// 留出 Action Bar 高度與間距，最後一張卡片不被蓋住。
.home-page--selecting { padding-bottom: 96px; }

// Figma Empty State / 沒有補貨提醒・簡潔版（1198:9821）；【新增用品】依 FR-401，樣式同我的用品 Empty State。
.reminder-empty {
  min-height: 367px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: t.$space-32;
  text-align: center;
}
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
  h3 { margin: 0 0 2px; color: t.$text-main; font: t.$font-weight-bold t.$font-size-heading / 30px t.$font-family; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular t.$font-size-body-sm / 22px t.$font-family; }
}
.empty-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-4;
  width: 222px;
  height: t.$button-height;
  font-size: t.$font-size-button;
}
.add-symbol { font-size: 20px; line-height: 1; }
</style>
