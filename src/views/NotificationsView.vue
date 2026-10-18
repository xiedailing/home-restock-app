<script setup>
import { computed, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useSharedNotificationsStore } from '../stores/sharedNotifications'
import { useItemsStore } from '../stores/items'
import backIcon from '../assets/add-item/back-chevron.svg'
import { notificationIcon } from '../utils/notificationCopy.js'
import { notificationDestination } from '../utils/notificationNavigation.js'
const router = useRouter()
const items = useItemsStore()
const store = useSharedNotificationsStore()
const appToast = inject('appToast')
const notifications = computed(() => store.visibleRecords)
const unread = computed(() => notifications.value.some(entry => !store.recipientState(entry).read))
function reportFailure(result) {
  if (result?.ok === false) appToast.showToast('通知狀態儲存失敗，請稍後再試。', null, '復原', 'error')
  return result?.ok !== false
}
onMounted(() => { store.pruneExpired(); reportFailure(store.markViewed()) })
function markAllRead() { reportFailure(store.markAllRead(notifications.value.map(entry => entry.id))) }
function back() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'inventory' })
}
async function follow(entry) {
  if (!reportFailure(store.markRead(entry.id))) return
  const destination = notificationDestination(entry, items)
  if (!destination.route) { appToast.showToast(destination.message, null, '復原', 'error'); return }
  if (destination.inventorySpaceId) items.inventorySpaceId = destination.inventorySpaceId
  await router.push(destination.route)
  if (destination.message) appToast.showToast(destination.message, null, '復原', 'error')
}
function notificationMessage(entry) { return entry.type === 'restock-due' ? entry.message.replace('：', '：\n') : entry.message }
function formatTime(time) {
  const date = new Date(time), today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat('zh-TW', sameDay ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { month: '2-digit', day: '2-digit' }).format(date)
}
</script>
<template>
  <section class="notifications-page">
    <header><button type="button" class="back-button" aria-label="返回" @click="back"><img :src="backIcon" alt="" /></button><h1>通知</h1><button type="button" class="mark-all-read" :disabled="!unread" @click="markAllRead">全部已讀</button></header>
    <div class="notification-card">
      <ul v-if="notifications.length">
        <li v-for="entry in notifications" :key="entry.id">
          <button type="button" class="notification-entry" :class="{ unread: !store.recipientState(entry).read }" :aria-label="`${store.recipientState(entry).read ? '已讀' : '未讀'}：${notificationMessage(entry)}`" @click="follow(entry)">
            <i :class="notificationIcon(entry.type)" class="entry-icon" aria-hidden="true"></i>
            <span class="entry-content"><template v-for="(line, index) in notificationMessage(entry).split('\n')" :key="index"><br v-if="index" /><span :class="{ 'notification-summary': index === 0 && line.endsWith('：') }">{{ line }}</span></template></span>
            <span class="entry-meta">
              <time :datetime="new Date(entry.createdAt).toISOString()">{{ formatTime(entry.createdAt) }}</time>
            </span>
          </button>
        </li>
      </ul>
      <div v-else class="notification-empty" role="status"><h2>目前沒有通知</h2><p>有新的共享用品動態時，會顯示在這裡。</p></div>
    </div>
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.notifications-page { padding: t.$space-16; max-width: 720px; margin: 0 auto; }
header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: t.$space-8; margin-bottom: t.$space-24; h1 { margin: 0; text-align: center; font-size: t.$font-size-card-title; letter-spacing: .5px; } }
.mark-all-read { justify-self: end; white-space: nowrap; padding: t.$space-8 t.$space-12; border: 0; border-radius: t.$radius-pill; background: t.$primary-soft; box-shadow: t.$shadow-raised; color: t.$primary-green; font: t.$font-weight-bold #{t.$font-size-body-sm} / normal t.$font-family; cursor: pointer; }
.mark-all-read:disabled { color: t.$text-disabled; box-shadow: none; cursor: default; }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; cursor: pointer; }
.notification-card { padding: 0; }
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: t.$space-8; }
li + li { border-top: 1px solid t.$border-color; padding-top: t.$space-8; }
.notification-entry { position: relative; display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: t.$space-16; width: 100%; padding: t.$space-16; border: 0; border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; color: t.$text-main; text-align: left; font: t.$font-weight-regular #{t.$font-size-body-sm} / 21px t.$font-family; cursor: pointer; &.unread { background: t.$primary-soft; .entry-content { font-weight: t.$font-weight-medium; } } }
.entry-content { grid-column: 2; grid-row: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-line; }
.notification-summary { white-space: normal; }
.entry-icon { grid-column: 1; grid-row: 1; width: 24px; text-align: center; font-size: 22px; line-height: 24px; height: 24px; display: grid; place-items: center; color: t.$primary-green; }
.entry-meta { grid-column: 3; grid-row: 1; align-self: stretch; display: flex; flex-direction: column; justify-content: space-between; align-items: center; gap: 0; flex-shrink: 0; white-space: nowrap; line-height: 21px; color: t.$text-sub; font-size: t.$font-size-caption; }
.notification-empty { margin: 0; padding: t.$space-24 t.$space-16; border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; color: t.$text-sub; text-align: center; font-size: t.$font-size-body-sm; h2 { margin: 0 0 t.$space-8; color: t.$text-main; font-size: t.$font-size-card-title; font-weight: t.$font-weight-bold; } p { margin: 0; line-height: 21px; } }
@media (max-width: 360px) {
  .notification-entry { column-gap: t.$space-8; }
}
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
