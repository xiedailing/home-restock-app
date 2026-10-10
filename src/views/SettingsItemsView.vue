<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useItemsStore } from '../stores/items'
import { limitSpaceName } from '../models/space'
import backIcon from '../assets/settings/category-back.svg'
import chevron from '../assets/settings/category-chevron.svg'
const store = useItemsStore()
const categoryName = ref('')
const error = ref('')
const duplicateName = computed(() => [...store.systemCategoryCounts, ...store.customCategoryCounts].some(category => category.name === categoryName.value.trim()))
const nameError = computed(() => duplicateName.value ? '已有重複分類名稱' : error.value)
const nameFocused = ref(false)
const nameLimitExceeded = computed(() => limitSpaceName(categoryName.value.trim()) !== categoryName.value.trim())
const nameCount = computed(() => {
  const text = categoryName.value
  const ascii = /^[\x00-\x7F]+$/.test(text)
  const count = Array.from(text).reduce((sum, char) => sum + (ascii || char.codePointAt(0) > 127 ? 1 : .5), 0)
  return `${Math.floor(count)}/${ascii ? 16 : 8}`
})
const deleteDialog = ref(null)
const visibleSystemCategories = computed(() => store.systemCategoryCounts.filter(category => category.count > 0))
const pendingCategory = ref(null)
const openCategory = ref(null)
const swipeOffset = ref(0)
const dragging = ref(false)
let gesture = null
let suppressClick = false
const sorting = ref(false)
const draggedCategory = ref(null)
let pressTimer
let sortCenters = []
function cancelPress() { clearTimeout(pressTimer) }
function beginSort(event, name) {
  sorting.value = true
  openCategory.value = null
  swipeOffset.value = 0
  draggedCategory.value = name
  suppressClick = true
  sortCenters = Array.from(document.querySelectorAll('.management-page [data-category-name]'), row => {
    const rect = row.getBoundingClientRect()
    return rect.top + rect.height / 2
  })
  gesture = { id: event.pointerId, element: event.currentTarget }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function finishSorting(event) {
  if (event.target.closest('.swipe-category')) return
  sorting.value = false
  draggedCategory.value = null
  cancelPress()
}
onMounted(() => document.addEventListener('pointerdown', finishSorting))
onBeforeUnmount(() => { cancelPress(); document.removeEventListener('pointerdown', finishSorting) })
const actionWidth = 88
const deleteTitle = '刪除分類？'
const deleteMessage = computed(() => {
  if (!pendingCategory.value) return ''
  const category = store.customCategoryCounts.find(category => category.name === pendingCategory.value)
  return category?.count
    ? `「${category.name}」內的${category.count}項用品也會一併刪除，無法復原。`
    : `即將刪除「${pendingCategory.value}」。`
})
function requestDeletion(name) {
  pendingCategory.value = name
  deleteDialog.value.showModal()
}
function rowOffset(name) { return openCategory.value === name ? swipeOffset.value : 0 }
function startSwipe(event, name) {
  if (event.button !== 0 || event.target.closest('button')) return
  cancelPress()
  suppressClick = false
  if (sorting.value) { event.preventDefault(); beginSort(event, name); return }
  pressTimer = setTimeout(() => beginSort(event, name), 500)
  const initial = openCategory.value === name ? swipeOffset.value : 0
  openCategory.value = name
  swipeOffset.value = initial
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, initial, element: event.currentTarget }
}
function moveSwipe(event) {
  if (!gesture || gesture.id !== event.pointerId) return
  if (sorting.value && draggedCategory.value) {
    event.preventDefault()
    const targetIndex = sortCenters.reduce((nearest, center, index) => Math.abs(event.clientY - center) < Math.abs(event.clientY - sortCenters[nearest]) ? index : nearest, 0)
    const names = store.customCategoryCounts.map(category => category.name)
    const from = names.indexOf(draggedCategory.value)
    if (from !== targetIndex && from >= 0) {
      names.splice(targetIndex, 0, names.splice(from, 1)[0])
      store.customCategories = names
    }
    return
  }
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (Math.hypot(dx, dy) > 8) cancelPress()
  if (!dragging.value) {
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return }
    if (Math.abs(dx) < 8) return
    dragging.value = true
    suppressClick = true
    gesture.element.setPointerCapture(event.pointerId)
  }
  event.preventDefault()
  swipeOffset.value = Math.max(-actionWidth, Math.min(0, gesture.initial + dx))
}
function finishSwipe(event) {
  cancelPress()
  if (sorting.value) {
    if (gesture?.element.hasPointerCapture(event.pointerId)) gesture.element.releasePointerCapture(event.pointerId)
    gesture = null
    draggedCategory.value = null
    return
  }
  if (!gesture || gesture.id !== event.pointerId) return
  swipeOffset.value = event.type === 'pointercancel' ? gesture.initial : swipeOffset.value < -actionWidth / 2 ? -actionWidth : 0
  dragging.value = false
  gesture = null
}
function handleRowClick(event) {
  if (sorting.value || suppressClick || swipeOffset.value < 0) {
    event.preventDefault()
    event.stopPropagation()
    if (!sorting.value && !suppressClick && swipeOffset.value < 0) swipeOffset.value = 0
    suppressClick = false
  }
}
function revealCategory(name) { openCategory.value = name; swipeOffset.value = -actionWidth }
function deleteCategories() {
  if (!pendingCategory.value) return
  store.removeCategories([pendingCategory.value])
  deleteDialog.value.close()
  pendingCategory.value = null
  openCategory.value = null
  swipeOffset.value = 0
  toast.value = '自訂分類已刪除'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 3000)
}
const toast = ref('')
let toastTimer
onBeforeUnmount(() => clearTimeout(toastTimer))
function addCategory() {
  if (nameLimitExceeded.value || duplicateName.value) return
  const result = store.addCategory(categoryName.value)
  error.value = result.ok ? '' : result.message
  if (result.ok) {
    categoryName.value = ''
    toast.value = '自訂分類已新增'
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toast.value = '' }, 3000)
  }
}
</script>
<template>
  <section class="management-page">
    <header class="management-header">
      <RouterLink :to="{ name: 'settings' }" class="back-button" aria-label="返回設定"><img :src="backIcon" alt="" /></RouterLink>
      <h1>用品管理</h1><span />
    </header>
    <h2>系統分類</h2>
    <div v-if="visibleSystemCategories.length" class="category-card system-category-card">
      <RouterLink v-for="category in visibleSystemCategories" :key="category.name" class="category-row" :to="{ name: 'item-category', params: { category: category.name } }">
        <span>{{ category.name }}</span><strong>{{ category.count }} 項</strong><img :src="chevron" alt="" />
      </RouterLink>
    </div>
    <div class="custom-heading">
      <div class="custom-title">
        <h2>自訂分類</h2>

      </div>
      <p class="management-hint">可自行新增分類並管理用品</p>
    </div>
    <div class="category-card custom-card">
      <p v-if="!store.customCategoryCounts.length" class="empty-category">尚無自訂分類</p>
      <TransitionGroup name="category-sort" tag="div">
      <div v-for="category in store.customCategoryCounts" :key="category.name" :data-category-name="category.name" class="swipe-category" :class="{ sorting, 'sort-dragging': draggedCategory === category.name }" @contextmenu.prevent @pointerdown="startSwipe($event, category.name)" @pointermove="moveSwipe" @pointerup="finishSwipe" @pointercancel="finishSwipe">
        <button type="button" v-if="!sorting" class="swipe-delete" :tabindex="rowOffset(category.name) < 0 ? 0 : -1" :aria-hidden="rowOffset(category.name) === 0" :aria-label="`刪除${category.name}分類`" @click="requestDeletion(category.name)">刪除</button>
        <RouterLink class="category-row swipe-content" :class="{ dragging }" :style="{ transform: `translateX(${rowOffset(category.name)}px)` }" :to="{ name: 'item-category', params: { category: category.name } }" draggable="false" @click.capture="handleRowClick" @keydown.left.prevent="revealCategory(category.name)" @keydown.right.prevent="swipeOffset = 0"><i v-if="sorting" class="fa-solid fa-grip sort-grip" aria-hidden="true"></i><span>{{ category.name }}</span><strong>{{ category.count }} 項</strong><img v-if="!sorting" :src="chevron" alt="" /></RouterLink>
      </div>
      </TransitionGroup>
      <form class="category-form" @submit.prevent="addCategory">
        <label class="visually-hidden" for="category-name">分類名稱</label>
        <div class="category-input-wrapper">
          <input id="category-name" v-model="categoryName" placeholder="輸入分類名稱 例如：文具" :class="{ 'limit-exceeded': nameLimitExceeded || !!nameError }" :aria-invalid="nameLimitExceeded || !!nameError" :aria-describedby="nameError ? 'category-error' : nameLimitExceeded ? 'category-length-error' : undefined" @focus="nameFocused = true" @blur="nameFocused = false" @input="error = ''" />
          <span v-if="nameFocused || nameLimitExceeded" class="category-name-count">{{ nameCount }}</span>
          <p v-if="nameLimitExceeded" id="category-length-error" class="category-length-error">名稱過長，請縮短。</p>
        </div>
        <button type="submit" :disabled="!categoryName.trim() || nameLimitExceeded || duplicateName">新增</button>
      </form>
      <p v-if="nameError" id="category-error" class="category-error" role="alert">{{ nameError }}</p>
    </div>
    <Teleport to="body">
      <dialog ref="deleteDialog" class="category-delete-dialog" aria-labelledby="category-delete-title" aria-describedby="category-delete-message" @click="event => { if (event.target === deleteDialog) deleteDialog.close() }">
        <form @submit.prevent="deleteCategories">
          <h2 id="category-delete-title">{{ deleteTitle }}</h2>
          <p id="category-delete-message">{{ deleteMessage }}</p>
          <div class="category-delete-dialog-actions">
            <button type="button" class="btn btn-secondary" autofocus @click="deleteDialog.close()">取消</button>
            <button type="submit" class="btn btn-danger">刪除</button>
          </div>
        </form>
      </dialog>
    </Teleport>
    <Teleport to="body"><Transition name="category-toast"><p v-if="toast" class="category-toast" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>{{ toast }}</p></Transition></Teleport>
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/space-layout' as layout;
.management-page { width: 100%; max-width: 358px; margin-inline: auto; padding-top: 16px; display: flex; flex-direction: column; gap: t.$space-16; color: t.$text-main; font-family: t.$font-family; text-align: left; }
.management-header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; h1 { margin: 0; text-align: center; font: 700 17px / 24px t.$font-family; } }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
h2 { margin: 0; color: #292624; font: 700 16px / 22px t.$font-family; }
.category-card { overflow: hidden; border: 1px solid rgba(237,234,227,.4); border-radius: 20px; background: #fbfaf6; box-shadow: t.$shadow-card; }
.category-row { cursor: pointer; display: flex; align-items: center; gap: 4px; @include layout.row; margin-left: 16px; padding-right: t.$space-16; border-bottom: 0; text-decoration: none; color: t.$text-body; font: 400 14px / 20px t.$font-family; span { flex: 1; } strong { font-weight: 500; color: t.$text-main; } img { width: 16px; height: 16px; } &:last-child { border-bottom: 0; } }
.system-category-card .category-row { position: relative; border-bottom: 0; &:not(:last-child)::after { content: ""; position: absolute; bottom: 0; left: 0; right: t.$space-16; height: 1px; background: t.$border-color; } }
.custom-card { padding-inline: t.$space-16; .category-row { margin-left: 0; padding-right: 0; } }
.empty-category { margin: 0; @include layout.row; display: flex; align-items: center; @include layout.divider; color: t.$text-disabled; font-size: 14px; }
.category-form { display: flex; align-items: flex-start; gap: 8px; padding-block: t.$space-16; input { width: 100%; min-width: 0; height: 48px; padding: 4px 52px 4px 14px; border: 0; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: 400 14px / 20px t.$font-family; &::placeholder { color: t.$text-disabled; } } button { flex: 0 0 64px; margin-top: 6px; height: 36px; border: 0; border-radius: t.$radius-pill; background: t.$primary-green; color: white; font: 700 14px / 20px t.$font-family; box-shadow: -2px -2px 5px rgba(255,255,255,.9), 3px 4px 7px rgba(42,74,39,.35), inset 1px 1.5px 2px rgba(31,58,29,.28), inset -1px -1px 2px rgba(255,255,255,.22); cursor: pointer; &:disabled { background: #e0e0e0; color: #a6a6a6; box-shadow: none; cursor: default; } } }
.category-input-wrapper { position: relative; flex: 1; min-width: 0; }
.category-name-count { position: absolute; top: 24px; right: 14px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; pointer-events: none; }
.category-form input.limit-exceeded { outline: 2px solid t.$accent-text; outline-offset: 2px; }
.category-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.management-hint { margin: 0; color: t.$text-sub; font-size: 12px; }
.custom-heading { display: flex; flex-direction: column; gap: t.$space-8; }
.custom-title { position: relative; height: 24px; display: flex; align-items: center; justify-content: space-between; min-height: 24px; i { display: inline-grid; place-items: center; width: 20px; height: 20px; color: t.$text-sub; font-size: 16px; flex-shrink: 0; } }
.swipe-category { margin-inline: -16px; position: relative; overflow: hidden; @include layout.divider; touch-action: pan-y; }
.swipe-category::after { z-index: 2; }
.swipe-content { position: relative; z-index: 1; background: #fbfaf6; border-bottom: 0; transition: transform .5s ease; user-select: none; &.dragging { transition: none; } }
.custom-card .swipe-content { padding-inline: t.$space-16; }
.category-sort-move { transition: transform .5s ease; }
@media (prefers-reduced-motion: reduce) { .category-sort-move { transition: none; } }
.swipe-category.sorting { touch-action: none; cursor: grab; }
.swipe-category.sort-dragging .swipe-content { background: t.$input-bg; cursor: grabbing; }
.sort-grip { margin-right: t.$space-8; color: t.$text-sub; font-size: 16px; }
.swipe-delete { position: absolute; inset: 0 0 0 auto; width: 88px; border: 0; background: t.$danger; color: t.$text-inverse; font: 500 14px / 20px t.$font-family; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .swipe-content { transition: none; } }

.category-delete-dialog { box-sizing: border-box; width: min(300px, calc(100% - 48px)); max-height: calc(100dvh - 48px); padding: t.$space-24 18px; border: 0; border-radius: t.$radius-card; background: t.$card-bg; color: t.$text-main; font-family: t.$font-family; text-align: center; box-shadow: 0 -2px 8px rgba(255,255,255,.18), 0 16px 36px rgba(43,42,38,.28); h2 { margin: 0; font-size: 18px; line-height: 1.45; } p { margin: t.$space-8 0 t.$space-24; color: t.$text-sub; font-size: t.$font-size-body; line-height: 1.45; } &::backdrop { background: rgba(29,29,31,.5); } &:focus { outline: none; } }
.category-delete-dialog-actions { display: flex; gap: t.$space-12; .btn { flex: 1; min-width: 0; min-height: 48px; font-size: t.$font-size-body; } .btn-secondary, .btn-secondary:focus, .btn-secondary:focus-visible { outline: none; } }
.category-toast { position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1100; width: max-content; max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2)); min-height: t.$toast-min-height; margin: 0; padding: t.$toast-padding-block t.$toast-padding-inline; display: flex; align-items: center; justify-content: center; gap: t.$space-8; border: 0; border-radius: t.$radius-pill; background: t.$toast-background; color: t.$toast-text; box-shadow: t.$toast-shadow; font-weight: t.$font-weight-bold; font-size: t.$font-size-body-sm; line-height: t.$line-height-body; font-family: t.$font-family; pointer-events: none; i { color: t.$toast-success-accent; } }
.category-toast-enter-active, .category-toast-leave-active { transition: opacity .5s ease; }
.category-toast-enter-from, .category-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .category-toast-enter-active, .category-toast-leave-active { transition: none; } }
.category-error { margin: 0 0 t.$space-12; color: t.$accent-text; font-size: t.$font-size-caption; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
