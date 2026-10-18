<script setup>
import AppToast from '../components/AppToast.vue'
import { useToast } from '../composables/useToast'
import { isValidInviteCode } from '../utils/inviteCode'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { getSpaceColor } from '../models/space'
import backIcon from '../assets/add-item/back-chevron.svg'
import chevron from '../assets/settings/chevron.svg'

const store = useItemsStore()
const route = useRoute()
const router = useRouter()
const spaceList = ref(null)
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '')
const validInviteCode = computed(() => isValidInviteCode(inviteCode.value))
const { toast, showToast, hideToast, runUndo } = useToast({ duration: 8000, pauseOnInteraction: true })
const noticeKind = ref('success')
const joinSucceeded = ref(false)
const createdSpace = computed(() => store.getSpace(route.query.createdSpaceId))
let createdToastDelayTimer
function openCreatedInvite() {
  if (!createdSpace.value?.shared) return
  hideToast()
  router.push({ name: 'edit-space', params: { spaceId: createdSpace.value.id }, query: { invite: '1' } })
}
onMounted(() => {
  if (route.query.spaceLeft) {
    noticeKind.value = 'exit'
    showToast(`已退出「${route.query.spaceLeft}」空間`)
  }
  if (!route.query.spaceCreated) return
  createdToastDelayTimer = setTimeout(() => {
    noticeKind.value = 'success'
    showToast('已成功新增空間', createdSpace.value?.shared ? openCreatedInvite : null, '邀請成員')
  }, 300)
})
onBeforeUnmount(() => clearTimeout(createdToastDelayTimer))
const sorting = ref(false)
const draggedSpace = ref('')
let pressTimer
let pressOrigin
let suppressClick = false
let activePointer = null
let rowCenters = []
function beginDrag(event, id) {
  cancelPress()
  activePointer = event.pointerId
  rowCenters = Array.from(spaceList.value.querySelectorAll('[data-space-id]'), row => {
    const bounds = row.getBoundingClientRect()
    return bounds.top + bounds.height / 2
  })
  spaceList.value.setPointerCapture(event.pointerId)
  draggedSpace.value = id
  suppressClick = true
}
function cancelPress() { clearTimeout(pressTimer) }
function startPress(event, id) {
  if (event.button !== 0) return
  pressOrigin = { x: event.clientX, y: event.clientY }
  if (sorting.value) {
    event.preventDefault()
    beginDrag(event, id)
    return
  }
  pressTimer = setTimeout(() => {
    sorting.value = true
    beginDrag(event, id)
  }, 500)
}
function movePointer(event) {
  if (!sorting.value) {
    if (pressOrigin && Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 8) cancelPress()
    return
  }
  if (!draggedSpace.value) return
  event.preventDefault()
  if (event.pointerId !== activePointer) return
  // 使用固定列位置判斷插入位置，避免動畫或手指遮住列時影響命中。
  const to = rowCenters.reduce((nearest, center, index) =>
    Math.abs(event.clientY - center) < Math.abs(event.clientY - rowCenters[nearest]) ? index : nearest, 0)
  const target = store.spaces[to]
  if (target) store.moveSpace(draggedSpace.value, target.id)
}
function endPointer() {
  cancelPress()
  if (activePointer !== null && spaceList.value?.hasPointerCapture(activePointer)) spaceList.value.releasePointerCapture(activePointer)
  activePointer = null
  draggedSpace.value = ''
  pressOrigin = null
}
function handleRowClick(event, id) {
  if (sorting.value || suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; return }
  router.push({ name: 'edit-space', params: { spaceId: id } })
}
function finishSorting(event) {
  if (event.target.closest('.space-list')) return
  sorting.value = false
  draggedSpace.value = ''
  suppressClick = false
}
onMounted(() => {
  document.addEventListener('pointermove', movePointer, { passive: false })
  document.addEventListener('pointerup', endPointer)
  document.addEventListener('pointercancel', endPointer)
  document.addEventListener('pointerdown', finishSorting)
})
onBeforeUnmount(() => {
  cancelPress()
  document.removeEventListener('pointermove', movePointer)
  document.removeEventListener('pointerup', endPointer)
  document.removeEventListener('pointercancel', endPointer)
  document.removeEventListener('pointerdown', finishSorting)
})
function joinSpace() {
  if (!validInviteCode.value) return
  const result = store.joinSpaceByCode(inviteCode.value)
  joinSucceeded.value = result.ok
  noticeKind.value = result.ok ? 'success' : 'error'
  showToast(result.message, null, '復原', result.ok ? 'success' : 'error')
  if (result.ok) inviteCode.value = ''
}
</script>

<template>
  <section class="spaces-page" aria-labelledby="spaces-page-title">
    <header class="spaces-header">
      <RouterLink :to="{ name: 'settings' }" class="back-button" aria-label="返回設定">
        <img :src="backIcon" alt="" />
      </RouterLink>
      <h1 id="spaces-page-title">空間管理</h1>
      <span aria-hidden="true" />
    </header>

    <section aria-labelledby="my-spaces-title">
      <h2 id="my-spaces-title">我的空間</h2>
      <p class="section-description">建立不同空間（如：辦公室、分租房），分門別類管理用品。</p>
      <div ref="spaceList" class="spaces-card">
        <TransitionGroup name="space-sort" tag="div" class="space-list" :class="{ sorting }">
          <div v-for="space in store.spaces" :key="space.id" class="space-row" :class="{ 'is-dragging': draggedSpace === space.id }" :data-space-id="space.id"
            @pointerdown="startPress($event, space.id)" @click="handleRowClick($event, space.id)" @keydown.enter.prevent="handleRowClick($event, space.id)" role="link" tabindex="0" @contextmenu.prevent @dragstart.prevent
            >
            <i v-if="sorting" class="fa-solid fa-grip sort-grip" aria-hidden="true"></i>
            <span class="space-dot" :style="{ backgroundColor: getSpaceColor(space.color).dark }" aria-hidden="true" />
            <span class="space-name">{{ space.name }}</span>
            <span v-if="space.shared" class="member-count">{{ store.getSpaceMembers(space.id).length }} 人</span>
            <img :src="chevron" alt="" />
          </div>
        </TransitionGroup>
        <RouterLink :to="{ name: 'add-space' }" class="add-space-link">＋ 新增空間</RouterLink>
      </div>


    </section>

    <section aria-labelledby="join-space-title">
      <h2 id="join-space-title">加入空間</h2>
      <p class="section-description">輸入邀請碼後即可同步共享待補清單。</p>
      <form class="spaces-card join-form" @submit.prevent="joinSpace">
        <label class="visually-hidden" for="invite-code">空間邀請碼</label>
        <input id="invite-code" v-model="inviteCode" placeholder="輸入空間邀請碼" autocomplete="off" />
        <button type="submit" class="join-button" :disabled="!validInviteCode">加入</button>
      </form>
      <AppToast :toast="toast" @undo="runUndo"><template v-if="noticeKind === 'exit'" #icon><i :class="noticeKind === 'exit' ? 'fa-solid fa-arrow-right-from-bracket' : 'fa-solid fa-circle-exclamation'" class="notice-icon" aria-hidden="true"></i></template></AppToast>
    </section>

  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/space-layout' as layout;

.spaces-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  color: t.$text-main;
  font-family: t.$font-family;
}
.spaces-header {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: 700 17px / 24px t.$font-family; }
}
.back-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  img { width: 24px; height: 24px; }
}
h2 { margin: 0 0 16px; color: #292624; font: 700 16px / 22px t.$font-family; }
.spaces-card {
  padding: 16px;
  border: 1px solid rgba(237, 234, 227, .4);
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
}
.space-list { padding-bottom: 0; margin-bottom: t.$space-16; @include layout.divider; }
.space-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  @include layout.row;
  border: 0;
  background: transparent;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  color: t.$text-body;
  font: 400 14px / 20px t.$font-family;
  img { width: 16px; height: 16px; flex-shrink: 0; }
}
.space-row:not(:last-child) { @include layout.divider; }
.space-list.sorting .space-row { touch-action: none; cursor: grab; user-select: none; }
.space-row.is-dragging { background: t.$input-bg; border-radius: 0; cursor: grabbing; }
.sort-grip { color: t.$text-disabled; flex-shrink: 0; }
.space-sort-move { transition: transform .5s ease; }
.space-sort-enter-active { transition: transform .5s ease, opacity .5s ease; }
.space-sort-enter-from { transform: translateY(-16px); opacity: 0; }
.space-list { overflow-x: clip; }
.sort-grip { display: grid; place-items: center; width: 32px; height: 20px; cursor: grab; touch-action: none; }
@media (prefers-reduced-motion: reduce) { .space-sort-move, .space-sort-enter-active, .join-toast-enter-active, .join-toast-leave-active { transition: none; } }
.space-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.space-name { flex: 1; overflow-wrap: anywhere; }
.add-space-link {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 48px;
  border-radius: t.$radius-pill;
  background: #ecf4ea;
  color: #3c763c;
  text-decoration: none;
  font: 700 16px / 22px t.$font-family;
}
h2:has(+ .section-description) { margin-bottom: t.$space-8; }
.section-description { margin: 0 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; line-height: 18px; }
.section-hint { margin: 16px 0 0; color: t.$text-sub; font-size: 12px; line-height: 18px; }
.join-form {
  display: flex;
  align-items: center;
  gap: 8px;
  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 48px;
    padding: 4px 14px;
    border: 0;
    border-radius: t.$radius-pill;
    background: t.$input-bg;
    box-shadow: t.$shadow-inset;
    color: t.$text-main;
    font: 400 16px / 22px t.$font-family;
    &::placeholder { color: t.$text-disabled; }
  }
}
.join-button {
  flex: 0 0 64px;
  height: 36px;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$primary-green;
  color: white;
  font: 700 14px / 20px t.$font-family;
  box-shadow: t.$shadow-primary;
}
.exit-space-toast, .compact-created-toast { width: max-content; justify-content: center; }
.exit-space-toast i { color: t.$primary-green; font-size: 20px; flex-shrink: 0; }
.member-count { color: t.$text-main; white-space: nowrap; }
button { cursor: pointer; }
.space-row:focus-visible, button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.join-button { cursor: pointer; &:disabled { background: #e0e0e0; color: #a6a6a6; box-shadow: none; cursor: default; } }
header h1 { letter-spacing: .5px; }
.notice-icon { width: 22px; flex-shrink: 0; font-size: 22px; color: t.$toast-success-accent; }
</style>
