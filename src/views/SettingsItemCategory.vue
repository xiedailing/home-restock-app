<script setup>
import { computed, ref, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import { SYSTEM_CATEGORIES } from '../models/itemCategories'
import GlobalItemEditor from '../components/settings/GlobalItemEditor.vue'
import backIcon from '../assets/settings/category-back.svg'
import checkIcon from '../assets/add-item/pill-check.svg'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-in-shopping-list-plain.svg'
const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()
const appToast = inject('appToast')
// 上一頁就是用品管理時直接退回，才會保留它的來源（例如從補貨頁進來）。
function goBack(event) {
  if (window.history.state?.back?.split('?')[0] !== '/settings/items') return
  event.preventDefault()
  router.back()
}
const category = computed(() => String(route.params.category))
const categorySection = computed(() => SYSTEM_CATEGORIES.includes(category.value)
  ? { label: '系統分類', hash: '#system-categories-title' }
  : { label: '自訂分類', hash: '#custom-categories-title' })
const items = computed(() => {
  const categoryItems = catalog.allItems.filter(item => item.category === category.value)
  return [
    ...categoryItems.filter(item => item.id.startsWith('preset:')),
    ...categoryItems.filter(item => !item.id.startsWith('preset:')).reverse(),
  ]
})
const itemGroups = computed(() => [
  { key: 'preset', title: '預設', items: items.value.filter(item => item.id.startsWith('preset:')) },
  { key: 'custom', title: '自訂', items: items.value.filter(item => !item.id.startsWith('preset:')) },
].filter(group => group.items.length))
const selecting = ref(false)
const selectedIds = ref([])
function toggleSelection() { closeSwipe(); selecting.value = !selecting.value; selectedIds.value = [] }
function selectItem(item) {
  if (!selecting.value) { edit(item); return }
  if (item.id.startsWith('preset:')) return
  selectedIds.value = selectedIds.value.includes(item.id) ? selectedIds.value.filter(id => id !== item.id) : [...selectedIds.value, item.id]
}
const openSwipeId = ref(null)
const swipeOffset = ref(0)
const swipeDragging = ref(false)
let swipeGesture = null
let suppressRowClick = false
function closeSwipe() { openSwipeId.value = null; swipeOffset.value = 0 }
function startSwipe(event, item) {
  if (selecting.value || item.id.startsWith('preset:') || event.button !== 0 || event.target.closest('.swipe-delete')) return
  const initial = openSwipeId.value === item.id ? swipeOffset.value : 0
  openSwipeId.value = item.id
  swipeOffset.value = initial
  suppressRowClick = false
  swipeGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, initial, element: event.currentTarget }
}
function moveSwipe(event) {
  if (!swipeGesture || swipeGesture.id !== event.pointerId) return
  const dx = event.clientX - swipeGesture.x
  const dy = event.clientY - swipeGesture.y
  if (!swipeDragging.value) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { swipeGesture = null; return }
    if (Math.abs(dx) < 8) return
    swipeDragging.value = true
    suppressRowClick = true
    swipeGesture.element.setPointerCapture(event.pointerId)
  }
  swipeOffset.value = Math.max(-88, Math.min(0, swipeGesture.initial + dx))
}
function finishSwipe(event) {
  if (!swipeGesture || swipeGesture.id !== event.pointerId) return
  swipeOffset.value = event.type === 'pointercancel' ? swipeGesture.initial : swipeOffset.value < -44 ? -88 : 0
  if (swipeGesture.element.hasPointerCapture(event.pointerId)) swipeGesture.element.releasePointerCapture(event.pointerId)
  swipeGesture = null
  swipeDragging.value = false
}
function clickRow(item) {
  if (suppressRowClick) { suppressRowClick = false; return }
  if (openSwipeId.value && swipeOffset.value) { closeSwipe(); return }
  selectItem(item)
}
function revealSwipe(item) {
  if (selecting.value || item.id.startsWith('preset:')) return
  openSwipeId.value = item.id
  swipeOffset.value = -88
}
const pendingDeleteIds = ref([])
function requestSingleDeletion(item) {
  if (item.id.startsWith('preset:')) return
  pendingDeleteIds.value = [item.id]
  deleteError.value = ''
  deleteDialog.value?.showModal()
}
function cancelDeletion() { deleteDialog.value?.close(); closeSwipe() }
const deleteDialog = ref(null)
const deleteError = ref('')
const deleting = ref(false)
function requestDeletion() {
  pendingDeleteIds.value = [...selectedIds.value]
  deleteError.value = ''
  deleteDialog.value?.showModal()
}
async function confirmDeletion() {
  if (deleting.value || !pendingDeleteIds.value.length) return
  deleting.value = true
  const result = catalog.removeCatalogItems(pendingDeleteIds.value)
  deleting.value = false
  if (!result.ok) { deleteError.value = result.error.message; return }
  deleteDialog.value?.close()
  closeSwipe()
  selecting.value = false
  selectedIds.value = []
  appToast.showToast(`已刪除 ${result.removedIds.length} 項用品`, () => {
    const restored = result.undo()
    if (!restored.ok) appToast.showToast(restored.error.message, null, '復原', 'error')
  })

}
const editorOpen = ref(false)
const editingItem = ref(null)
function edit(item = null) {
  editingItem.value = item ? { ...item } : null
  editorOpen.value = true
}
</script>
<template>
  <section class="category-page" :class="{ 'category-page--empty': !items.length }">
    <header><RouterLink class="back-button" :to="{ name: 'item-management' }" aria-label="返回用品管理" @click.capture="goBack"><img :src="backIcon" alt="" /></RouterLink><h1><span class="desktop-management-prefix"><RouterLink class="category-overview-link" :to="{ name: 'item-management', hash: categorySection.hash }">{{ categorySection.label }}</RouterLink><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>{{ category }}</h1><button v-if="items.length" type="button" class="delete-category" :aria-label="selecting ? '取消選取' : '選取用品刪除'" @click="toggleSelection"><span v-if="selecting" class="cancel-selection">取消</span><i v-else class="fa-solid fa-trash-can" aria-hidden="true"></i></button><span v-else /></header>
    <section v-for="group in itemGroups" :key="group.key" class="item-group" :aria-labelledby="`group-${group.key}`">
      <h2 :id="`group-${group.key}`" class="group-title">{{ group.title }}</h2>
    <div class="category-card">
      <div v-for="item in group.items" :key="item.id" class="swipe-item" @pointerdown="startSwipe($event, item)" @pointermove="moveSwipe" @pointerup="finishSwipe" @pointercancel="finishSwipe">
        <button v-if="!selecting && !item.id.startsWith('preset:')" type="button" class="swipe-delete" :tabindex="openSwipeId === item.id && swipeOffset < 0 ? 0 : -1" :aria-hidden="openSwipeId !== item.id || swipeOffset === 0" :aria-label="`刪除${item.name}`" @click="requestSingleDeletion(item)">刪除</button>
      <button type="button" class="item-row" :class="{ dragging: swipeDragging }" :style="{ transform: `translateX(${openSwipeId === item.id ? swipeOffset : 0}px)` }"  :disabled="selecting && item.id.startsWith('preset:')" :aria-pressed="selecting ? selectedIds.includes(item.id) : undefined" @click="clickRow(item)" @keydown.left.prevent="revealSwipe(item)" @keydown.right.prevent="closeSwipe"><span v-if="selecting && !item.id.startsWith('preset:')" class="selection-circle" :class="{ checked: selectedIds.includes(item.id) }" aria-hidden="true"><img v-if="selectedIds.includes(item.id)" :src="checkIcon" alt="" /></span><span>{{ item.name }}</span><i v-if="!selecting" class="fa-solid fa-chevron-right row-arrow" aria-hidden="true"></i></button>
      </div>
    </div>
    </section>
    <div v-if="!items.length" class="category-empty" role="status">
      <div class="empty-illustration" aria-hidden="true"><img :src="emptyItemIcon" alt="" /></div>
      <div class="empty-copy"><h2>這個分類目前還沒有用品</h2></div>
      <RouterLink class="btn btn-primary empty-add" :to="{ name: 'add-item', query: { from: 'item-management', category } }"><span class="add-symbol" aria-hidden="true">＋</span>新增用品</RouterLink>
    </div>
    <footer v-if="items.length" class="category-actions">
    <button v-if="selecting" class="btn btn-danger delete-selected" type="button" :disabled="!selectedIds.length" @click="requestDeletion">刪除已選取 {{ selectedIds.length }} 項用品</button>
    <RouterLink v-else class="btn btn-primary create-item" :to="{ name: 'add-item', query: { from: 'item-management', category } }">＋ 新增用品</RouterLink>
    <p v-if="selecting" class="delete-hint">預設用品不可刪除</p>
    </footer>
    <Teleport to="body"><dialog ref="deleteDialog" class="category-delete-dialog" aria-labelledby="category-delete-title" aria-describedby="category-delete-description" @cancel="closeSwipe">
      <form @submit.prevent="confirmDeletion">
        <h2 id="category-delete-title">刪除 {{ pendingDeleteIds.length }} 項用品？</h2>
        <p id="category-delete-description">確定刪除選取的用品嗎？</p>
        <p class="preserved-data">已加入空間的用品與補貨紀錄不受影響。</p>
        <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>
        <div class="delete-actions"><button type="button" class="btn btn-secondary" :disabled="deleting" @click="cancelDeletion">取消</button><button type="submit" class="btn btn-danger" :disabled="deleting">刪除</button></div>
      </form>
    </dialog></Teleport>
    <GlobalItemEditor :open="editorOpen" :item="editingItem" @close="editorOpen = false" />
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/space-layout' as layout;
.category-page { box-sizing: border-box; min-height: calc(100svh - 167px); padding-bottom: 0; display: flex; flex-direction: column; width: 100%; max-width: 358px; margin-inline: auto; padding-top: t.$space-16; color: t.$text-main; font-family: t.$font-family; text-align: left; }
.desktop-management-prefix { display: none; }
.category-overview-link { color: inherit; font: inherit; text-decoration: none; }
.category-overview-link:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 4px; border-radius: 4px; }
header { min-height: 44px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; margin-bottom: t.$space-16; h1 { margin: 0; font-size: 17px; text-align: center; letter-spacing: .5px; overflow-wrap: anywhere; } }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
.preview-mode { margin: 0 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.item-group { flex-shrink: 0; }
// 設定主頁相鄰區塊：父層 16px gap 加區塊 15px margin。
.item-group + .item-group { margin-top: calc(#{t.$space-16} + 15px); }
.group-title { margin: 0 0 t.$space-8; color: t.$text-sub; font: t.$font-weight-regular 12px / 20px t.$font-family; }
.category-card { overflow: hidden; border: 1px solid t.$border-color; border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; }
.item-row { box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; @include layout.row(48px, t.$space-16); border: 0; background: t.$card-bg; color: t.$text-body; text-align: left; font: t.$font-weight-regular #{t.$font-size-body-sm} / 20px t.$font-family; overflow-wrap: anywhere;  }
.swipe-item { position: relative; overflow: hidden; touch-action: pan-y; &:not(:last-child) { border-bottom: 1px solid t.$border-color; } }
.swipe-item .item-row { position: relative; transition: transform .25s ease; user-select: none; &.dragging { transition: none; } }
.swipe-delete { position: absolute; inset: 0 0 0 auto; width: 88px; border: 0; background: t.$danger; color: t.$text-inverse; font: inherit; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .swipe-item .item-row { transition: none; } }
.row-arrow { margin-left: auto; color: t.$text-disabled; font-size: 14px; }
.selection-circle { display: grid; place-items: center; flex-shrink: 0; width: 22px; height: 22px; border: 1px solid t.$border-color; border-radius: 50%; text-align: center; &.checked { background: t.$primary-green; color: white; } img { width: 14px; height: 14px; filter: brightness(0) invert(1); } }
.item-row { gap: 12px; &:disabled { color: t.$text-disabled; cursor: default; } }
.category-card, header, .category-actions { flex-shrink: 0; }
.category-actions { position: relative; margin-top: auto; padding-top: t.$space-24; }
.delete-hint { position: absolute; top: 100%; left: 0; right: 0; margin: 8px 0 0; text-align: center; color: t.$text-sub; font-size: 12px; line-height: 20px; }
.category-actions .add-item { margin-top: 0; }
.add-item:disabled { color: t.$text-disabled; cursor: default; }
.category-page--empty { min-height: calc(100svh - 167px); }
.category-page--empty header { flex-shrink: 0; }
.category-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: t.$space-24; text-align: center; }
.category-empty > * { flex-shrink: 0; }
.empty-illustration { display: grid; place-items: center; width: 88px; height: 88px; border-radius: t.$radius-pill; background: t.$active-green; box-shadow: inset -3px -3px 7px rgba(255,255,255,.9), inset 2px 3px 7px rgba(138,158,136,.16); img { width: 57px; height: 57px; } }
.empty-copy { width: 100%; h2 { margin: 0 0 2px; color: t.$text-main; font: t.$font-weight-bold #{t.$font-size-heading} / 30px t.$font-family; letter-spacing: 0; overflow-wrap: anywhere; } }
.empty-add { width: 160px; max-width: 100%; min-height: 48px; height: 48px; padding-block: 0; font-size: t.$font-size-button; &:active { background: t.$primary-green; } @media (min-width: 1024px) and (hover: hover) and (pointer: fine) { &:hover { background: t.$primary-green; } } }
.add-symbol { font-size: 20px; line-height: 1; }
@media (max-height: 600px) { .category-empty { gap: t.$space-16; } }
.add-item { box-sizing: border-box; text-decoration: none; width: 100%; margin-top: t.$space-16; padding: t.$space-8 t.$space-16; display: flex; justify-content: center; align-items: center; min-height: t.$button-height; border: 0; border-radius: t.$radius-pill; background: t.$primary-soft; color: t.$primary-green; font: t.$font-weight-bold #{t.$font-size-button} / 22px t.$font-family; cursor: pointer; }
.create-item, .delete-selected { width: 100%; max-width: 314px; min-height: 48px; margin: auto auto 0; display: flex; font: 700 16px / 22px t.$font-family; }
.delete-selected:disabled { opacity: .45; cursor: default; }
.cancel-selection { color: t.$text-button-secondary; }
.delete-category { width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: t.$text-disabled; font-size: 16px; cursor: pointer; }
.category-delete-dialog { width: min(320px, calc(100vw - 32px)); margin: auto; padding: t.$space-24; border: 0; border-radius: t.$radius-card; background: t.$card-bg; color: t.$text-main; box-shadow: t.$shadow-card; text-align: center; &::backdrop { background: rgba(29,29,31,.35); } h2 { margin: 0 0 t.$space-8; font-size: 18px; overflow-wrap: anywhere; } p { color: t.$text-sub; font-size: 15px; overflow-wrap: anywhere; margin-bottom: 0; } .preserved-data { margin-top: 0; } .delete-error { color: t.$accent-text; } }
.delete-actions { display: flex; gap: t.$space-12; margin-top: t.$space-24; .btn { flex: 1; min-width: 0; } }
button:focus-visible, a:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }

@media (max-width: 1023px) {
  // 同一個 footer 在新增與刪除模式保持相同的底部操作位置。
  // 空分類維持圖示、文字與新增按鈕成組置中的設計。
  .category-page:not(.category-page--empty) {
    min-height: calc(100svh - max(44px, env(safe-area-inset-bottom)));
  }
}
</style>
