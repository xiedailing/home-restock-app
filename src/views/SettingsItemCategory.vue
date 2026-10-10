<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { useToast } from '../composables/useToast'
import SpaceTag from '../components/SpaceTag.vue'
import { getItemCategory } from '../models/itemCategories'
import backIcon from '../assets/settings/category-back.svg'
import checkboxOn from '../assets/settings/category-checkbox-on.svg'
import chevron from '../assets/settings/category-chevron.svg'
import emptyItem from '../assets/household-icons-by-state/common/generic-item-in-stock.svg'
const route = useRoute()
const router = useRouter()
const store = useItemsStore()
const category = computed(() => route.params.category)
const items = computed(() => store.itemsWithStatus.filter(item => getItemCategory(item) === category.value))
const openItem = ref(null)
const offset = ref(0)
const dragging = ref(false)
const deleteDialog = ref(null)
const pendingItem = ref(null)
const selecting = ref(false)
const selectedIds = ref([])
const bulkPending = ref(false)
function toggleSelectionMode() { selecting.value = !selecting.value; selectedIds.value = []; offset.value = 0 }
function requestBulkDeletion() { if (!selectedIds.value.length) return; bulkPending.value = true; deleteDialog.value.showModal() }
const deleteTitle = computed(() => bulkPending.value ? `刪除 ${selectedIds.value.length} 項用品？` : `刪除${pendingItem.value?.name || '用品'}？`)
const deleteMessage = computed(() => {
  if (bulkPending.value) return `即將刪除所選${selectedIds.value.length}項用品，補貨提醒與紀錄也會一併刪除。${selectedIds.value.some(id => store.getSpace(store.getItem(id)?.spaceId)?.shared) ? '共享空間的刪除將同步所有成員。' : ''}`
  const item = pendingItem.value
  if (!item) return ''
  const space = store.getSpace(item.spaceId)
  const spaceName = space?.name || '未指定空間'
  if (space?.shared) return `將從「${spaceName}」空間刪除並同步所有成員，相關紀錄與提醒將一併刪除。`
  return `「${item.name}」將從「${spaceName}」空間刪除，補貨提醒與紀錄也會一併刪除。`
})
const { toast, showToast, runUndo } = useToast()
let gesture
let suppressClick = false
function startSwipe(event, id) {
  if (selecting.value || event.button !== 0 || event.target.closest('button')) return
  suppressClick = false
  const initial = openItem.value === id ? offset.value : 0
  openItem.value = id
  offset.value = initial
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, initial, element: event.currentTarget }
}
function moveSwipe(event) {
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!dragging.value) {
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return }
    if (Math.abs(dx) < 8) return
    dragging.value = true
    suppressClick = true
    gesture.element.setPointerCapture(event.pointerId)
  }
  event.preventDefault()
  offset.value = Math.max(-88, Math.min(0, gesture.initial + dx))
}
function endSwipe(event) {
  if (!gesture || gesture.id !== event.pointerId) return
  offset.value = event.type === 'pointercancel' ? gesture.initial : offset.value < -44 ? -88 : 0
  dragging.value = false
  gesture = null
}
function openDetail(item) {
  if (suppressClick) { suppressClick = false; return }
  if (offset.value < 0) { offset.value = 0; return }
  router.push({ name: 'item-detail', params: { id: item.id } })
}
function requestDeletion(item) {
  bulkPending.value = false
  pendingItem.value = { ...item }
  deleteDialog.value.showModal()
}
function confirmDeletion() {
  if (bulkPending.value) {
    const removed = store.items.map((item, index) => ({ id: item.id, index })).filter(entry => selectedIds.value.includes(entry.id)).map(entry => ({ ...entry, snapshot: store.snapshotItem(entry.id) }))
    for (const entry of removed) store.removeItem(entry.id)
    deleteDialog.value.close()
    selecting.value = false
    selectedIds.value = []
    bulkPending.value = false
    showToast(`已刪除${removed.length}項用品`, () => {
      for (const entry of removed) if (!store.getItem(entry.id)) store.items.splice(Math.min(entry.index, store.items.length), 0, structuredClone(entry.snapshot))
      if (removed.some(entry => entry.id === store.recentlyRemoved?.item.id)) store.clearRecentlyRemoved()
    })
    return
  }
  if (!pendingItem.value) return
  const deletedId = pendingItem.value.id
  store.removeItem(deletedId)
  deleteDialog.value.close()
  pendingItem.value = null
  openItem.value = null
  offset.value = 0
  showToast('用品已刪除', () => {
    if (store.recentlyRemoved?.item.id === deletedId) store.undoRemoveItem()
  })
}
</script>
<template>
  <section class="category-page">
    <header><RouterLink class="back-button" :to="{ name: 'item-management' }" aria-label="返回用品管理"><img :src="backIcon" alt="" /></RouterLink><h1>{{ category }}</h1><div v-if="selecting" class="bulk-actions"><button type="button" class="btn btn-secondary" @click="toggleSelectionMode">取消</button><button type="button" class="btn btn-danger" :disabled="!selectedIds.length" @click="requestBulkDeletion">刪除 {{ selectedIds.length }}</button></div><button v-else-if="items.length" type="button" class="category-trash" :aria-pressed="selecting" aria-label="批次刪除用品" @click="toggleSelectionMode"><svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 8.5v5M11.5 8.5v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg></button><span v-else /></header>
    <div v-if="!items.length" class="category-empty" role="status">
      <div class="empty-disc"><img :src="emptyItem" alt="" width="57" height="57" /></div>
      <h2>此分類尚無用品</h2>
      <p>新增用品並選擇此分類後，會顯示在這裡。</p>
    </div>
    <div v-else class="category-card">
      <div v-for="item in items" :key="item.id" class="swipe-item" @pointerdown="startSwipe($event, item.id)" @pointermove="moveSwipe" @pointerup="endSwipe" @pointercancel="endSwipe">
        <button v-if="!selecting" type="button" class="swipe-delete" :tabindex="openItem === item.id && offset < 0 ? 0 : -1" :aria-hidden="openItem !== item.id || offset === 0" :aria-label="`刪除${item.name}`" @click="requestDeletion(item)">刪除</button>
        <label v-if="selecting" class="item-row"><span class="item-checkbox"><input v-model="selectedIds" type="checkbox" :value="item.id" /><img v-if="selectedIds.includes(item.id)" :src="checkboxOn" alt="" aria-hidden="true" /></span><div class="item-labels"><SpaceTag :space-id="item.spaceId" /><span class="item-name">{{ item.name }}</span></div></label>
        <div v-else class="item-row" :class="{ dragging }" :style="{ transform: `translateX(${openItem === item.id ? offset : 0}px)` }" tabindex="0" @click="openDetail(item)" @keydown.enter.prevent="openDetail(item)" role="link" @keydown.left.prevent="openItem = item.id; offset = -88" @keydown.right.prevent="offset = 0"><div class="item-labels"><SpaceTag :space-id="item.spaceId" /><span class="item-name">{{ item.name }}</span></div><img :src="chevron" alt="" draggable="false" /></div>
      </div>
    </div>
    <Teleport to="body">
      <dialog ref="deleteDialog" class="item-delete-dialog" aria-labelledby="item-delete-title" aria-describedby="item-delete-message" @click="event => { if (event.target === deleteDialog) deleteDialog.close() }">
        <form @submit.prevent="confirmDeletion">
          <h2 id="item-delete-title">{{ deleteTitle }}</h2>
          <p id="item-delete-message">{{ deleteMessage }}</p>
          <div class="item-delete-actions"><button type="button" class="btn btn-secondary" autofocus @click="deleteDialog.close()">取消</button><button type="submit" class="btn btn-danger">刪除</button></div>
        </form>
      </dialog>
      <Transition name="item-toast"><div v-if="toast" class="item-toast" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>{{ toast.message }}</span><button v-if="toast.undo" type="button" class="item-toast-undo" @click="runUndo">復原</button></div></Transition>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.category-trash { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border: 0; background: transparent; color: t.$text-sub; cursor: pointer; svg { width: 20px; height: 20px; } }
.bulk-actions { position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; gap: t.$space-8; .btn { min-height: 36px; padding: 8px 10px; font-size: t.$font-size-caption; line-height: 20px; } }
.item-checkbox { position: relative; display: block; width: 24px; height: 24px; flex: 0 0 24px; margin-right: 6px; border-radius: 6px; overflow: hidden; }
.item-checkbox input { appearance: none; box-sizing: border-box; display: block; width: 24px; height: 24px; margin: 0; border: 1.5px solid #a9a59b; border-radius: 6px; background: t.$surface-bg; box-shadow: t.$shadow-raised; cursor: pointer; &:checked { border: 0; background: t.$primary-green; box-shadow: none; } }
.item-row .item-checkbox img { position: absolute; inset: 0; width: 24px; height: 24px; pointer-events: none; }
.item-checkbox:focus-within { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.category-page { width: 100%; max-width: 358px; margin-inline: auto; padding-top: 16px; color: t.$text-main; font-family: t.$font-family; text-align: left; }
header { position: relative; min-height: 44px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; margin-bottom: 16px; h1 { margin: 0; font-size: 17px; text-align: center; } }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
.category-card { overflow: hidden; border: 1px solid rgba(237,234,227,.4); border-radius: 20px; background: #fbfaf6; box-shadow: t.$shadow-card; }
.item-row { cursor: pointer; display: flex; align-items: center; gap: 4px; min-height: 48px; margin: 0; padding: 12px 16px; background: #fbfaf6; position: relative; transition: transform .5s ease; user-select: none; &.dragging { transition: none; } color: t.$text-body; font: 400 14px / 20px t.$font-family; .item-labels { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; } .item-name { min-width: 0; overflow-wrap: anywhere; } :deep(.space-tag) { flex: 0 0 auto; font-size: t.$font-size-caption; } img { width: 16px; height: 16px; flex-shrink: 0; } &:last-child { border-bottom: 0; } }
.category-empty { display: flex; flex-direction: column; align-items: center; padding-top: max(64px, calc(36dvh - 76px)); text-align: center; }
.empty-disc { display: grid; place-items: center; width: 88px; height: 88px; margin-bottom: 19px; border-radius: 50%; background: t.$active-green; box-shadow: t.$shadow-added; img { display: block; width: 57px; height: 57px; } }
.category-empty h2 { margin: 0 0 t.$space-4; color: t.$text-main; font-family: t.$font-family; font-weight: t.$font-weight-bold; font-size: t.$font-size-heading; line-height: 30px; }
.category-empty p { max-width: 318px; margin: 0; color: t.$text-sub; font-size: t.$font-size-body-sm; line-height: t.$line-height-body; }
.swipe-item { position: relative; overflow: hidden; touch-action: pan-y; border-bottom: 1px solid t.$border-color; &:last-child { border-bottom: 0; } }
.swipe-delete { position: absolute; inset: 0 0 0 auto; width: 88px; border: 0; background: t.$danger; color: t.$text-inverse; font: 500 14px / 20px t.$font-family; cursor: pointer; }
.item-row:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .item-row { transition: none; } }
.item-delete-dialog { box-sizing: border-box; width: min(300px, calc(100% - 48px)); max-height: calc(100dvh - 48px); padding: t.$space-24 18px; border: 0; border-radius: t.$radius-card; background: t.$card-bg; color: t.$text-main; font-family: t.$font-family; text-align: center; box-shadow: 0 -2px 8px rgba(255,255,255,.18), 0 16px 36px rgba(43,42,38,.28); h2 { margin: 0; font-size: 18px; line-height: 1.45; } p { margin: t.$space-8 0 t.$space-24; color: t.$text-sub; font-size: t.$font-size-body; line-height: 1.45; } &::backdrop { background: rgba(29,29,31,.5); } &:focus { outline: none; } }
.item-delete-actions { display: flex; gap: t.$space-12; .btn { flex: 1; min-width: 0; min-height: 48px; font-size: t.$font-size-body; } .btn-secondary, .btn-secondary:focus, .btn-secondary:focus-visible { outline: none; } }
.item-toast { position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1100; width: max-content; max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2)); min-height: t.$toast-min-height; margin: 0; padding: t.$toast-padding-block t.$toast-padding-inline; display: flex; align-items: center; justify-content: center; gap: t.$space-8; border: 0; border-radius: t.$radius-pill; background: t.$toast-background; color: t.$toast-text; box-shadow: t.$toast-shadow; font-weight: t.$font-weight-bold; font-size: t.$font-size-body-sm; line-height: t.$line-height-body; font-family: t.$font-family; i { color: t.$toast-success-accent; } }
.item-toast-undo { padding: 4px; border: 0; background: transparent; color: t.$toast-success-accent; font: inherit; cursor: pointer; }
.item-toast-enter-active, .item-toast-leave-active { transition: opacity .5s ease; }
.item-toast-enter-from, .item-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .item-toast-enter-active, .item-toast-leave-active { transition: none; } }
</style>
