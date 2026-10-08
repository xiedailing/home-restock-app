<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { getSpaceColor } from '../models/space'
import toastCheck from '../assets/settings/toast-check.svg'
import chevron from '../assets/settings/chevron.svg'

const store = useItemsStore()
const route = useRoute()
const router = useRouter()
const spaceList = ref(null)
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '')
const notice = ref('')
const createdSpace = computed(() => store.getSpace(route.query.createdSpaceId))
const createdToast = ref(false)
const exitToast = ref(false)
let exitToastTimer
let createdToastDelayTimer
let createdToastTimer
function openCreatedInvite() {
  if (!createdSpace.value?.shared) return
  clearTimeout(createdToastTimer)
  createdToast.value = false
  router.push({ name: 'edit-space', params: { spaceId: createdSpace.value.id }, query: { invite: '1' } })
}
onMounted(() => {
  if (route.query.spaceLeft) {
    exitToast.value = true
    exitToastTimer = setTimeout(() => { exitToast.value = false }, 3000)
  }
  if (!route.query.spaceCreated) return
  // 帶操作的提示保留較久，讓使用者有時間點擊邀請。
  createdToastDelayTimer = setTimeout(() => {
    createdToast.value = true
    createdToastTimer = setTimeout(() => { createdToast.value = false }, 6000)
  }, 300)
})
onBeforeUnmount(() => { clearTimeout(createdToastDelayTimer); clearTimeout(createdToastTimer); clearTimeout(exitToastTimer) })
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
let noticeTimer
function joinSpace() {
  const result = store.joinSpaceByCode(inviteCode.value)
  notice.value = result.message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
  if (result.ok) inviteCode.value = ''
}
onBeforeUnmount(() => clearTimeout(noticeTimer))
</script>

<template>
  <section class="spaces-page" aria-labelledby="spaces-page-title">
    <header class="spaces-header">
      <RouterLink :to="{ name: 'settings' }" class="back-button" aria-label="返回設定">
        <img :src="chevron" alt="" />
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
      <Teleport to="body">
        <Transition name="created-success-toast">
          <div v-if="createdToast" class="created-space-toast" role="status">
            <span class="created-message"><img :src="toastCheck" alt="" />已成功新增空間</span>
            <button v-if="createdSpace?.shared" type="button" @click="openCreatedInvite">邀請成員</button>
          </div>
        </Transition>
      </Teleport>
      <Teleport to="body">
        <Transition name="created-toast">
          <div v-if="exitToast" class="created-space-toast exit-space-toast" role="status">
            <span class="created-message"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>已退出「{{ route.query.spaceLeft }}」空間</span>
          </div>
        </Transition>
      </Teleport>
    </section>

    <section aria-labelledby="join-space-title">
      <h2 id="join-space-title">加入空間</h2>
      <p class="section-description">輸入邀請碼後即可同步共享待補清單。</p>
      <form class="spaces-card join-form" @submit.prevent="joinSpace">
        <label class="visually-hidden" for="invite-code">空間邀請碼</label>
        <input id="invite-code" v-model="inviteCode" placeholder="輸入空間邀請碼" autocomplete="off" />
        <button type="submit" class="join-button">加入</button>
      </form>
      <Teleport to="body"><Transition name="join-toast"><p v-if="notice" class="invite-toast" role="status">{{ notice }}</p></Transition></Teleport>
    </section>

  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
// 頁面靜止時保留卡片陰影，切頁動畫期間沿用 App 的裁切。
:global(.app-container .app-content:has(.spaces-page):not(:has(.page-forward-enter-active, .page-forward-leave-active, .page-back-enter-active, .page-back-leave-active))) { overflow: visible; }

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
  img { width: 24px; height: 24px; transform: rotate(180deg); }
}
h2 { margin: 0 0 16px; color: #292624; font: 700 16px / 22px t.$font-family; }
.spaces-card {
  padding: 16px;
  border: 1px solid rgba(237, 234, 227, .4);
  border-radius: 20px;
  background: #fbfaf6;
  box-shadow: t.$shadow-card;
}
.space-list { padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid t.$border-color; }
.space-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 48px;
  padding: 12px 8px 12px 16px;
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
.space-list.sorting .space-row { touch-action: none; cursor: grab; user-select: none; }
.space-row.is-dragging { background: t.$input-bg; border-radius: t.$radius-input; cursor: grabbing; }
.sort-grip { color: t.$text-disabled; flex-shrink: 0; }
.space-sort-move { transition: transform .5s ease; }
.space-sort-enter-active { transition: transform .5s ease, opacity .5s ease; }
.space-sort-enter-from { transform: translateY(-16px); opacity: 0; }
.space-list { overflow-x: clip; }
.join-toast-enter-active, .join-toast-leave-active { transition: transform .5s ease; }
.join-toast-enter-from, .join-toast-leave-to { transform: translate(-50%, 24px); }
.sort-grip { display: grid; place-items: center; width: 32px; min-height: 24px; cursor: grab; touch-action: none; }
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
    font: 400 14px / 20px t.$font-family;
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
  box-shadow: -2px -2px 5px rgba(255,255,255,.9), 3px 4px 7px rgba(42,74,39,.35), inset 1px 1.5px 2px rgba(31,58,29,.28), inset -1px -1px 2px rgba(255,255,255,.22);
}
.invite-toast { position: fixed; bottom: 132px; left: 50%; transform: translateX(-50%); z-index: 1100; max-width: calc(100% - 32px); padding: 14px 24px; border: 1px solid t.$border-color; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$text-main; box-shadow: t.$shadow-card; font: 700 14px / 20px t.$font-family; text-align: center; }
.created-space-toast { position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1100; width: t.$toast-max-width; max-width: calc(100% - t.$toast-inset-inline * 2); min-height: 52px; padding: 8px 22px 8px 18px; display: flex; align-items: center; justify-content: space-between; gap: t.$space-8; border: 1px solid #d4cbbe; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: 0 -2px 8px rgba(255,255,255,.8), 0 8px 24px rgba(140,136,127,.36), 0 2px 6px rgba(107,102,92,.2); color: t.$text-main; font: 500 14px t.$font-family; button { padding: 8px 0; border: 0; background: transparent; color: t.$primary-green; font: 700 14px t.$font-family; white-space: nowrap; } }
.created-message { display: flex; align-items: center; gap: 10px; img { width: 22px; height: 22px; flex-shrink: 0; } }
.exit-space-toast { width: max-content; justify-content: center; }
.exit-space-toast i { color: t.$primary-green; font-size: 20px; flex-shrink: 0; }
.created-success-toast-enter-active, .created-success-toast-leave-active { transition: opacity .5s ease; }
.created-success-toast-enter-from, .created-success-toast-leave-to { opacity: 0; }
.created-toast-leave-active { transition: opacity .5s ease; }
.created-toast-enter-active { transition: opacity .5s ease; }
.created-toast-enter-from { opacity: 0; }
.created-toast-leave-to { opacity: 0; }
.member-count { color: t.$text-main; white-space: nowrap; }
button { cursor: pointer; }
.space-row:focus-visible, button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
