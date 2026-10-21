<script setup>
import { createTitleLongPress } from '../utils/titleLongPress.js'
import { allowsNotificationDemo } from '../utils/notificationDemoMode.js'
import { useNativeNotificationsStore } from '../stores/nativeNotifications'
import { resolveShoppingNotification } from '../utils/shoppingNotificationTarget.js'
import AppToast from '../components/AppToast.vue'
import BottomSheet from '../components/BottomSheet.vue'
import RestockDateBar from '../components/restock/RestockDateBar.vue'
import { addDays, toDateString, getReminderStatus } from '../models/item'
import { computed, ref, watch, nextTick, inject, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SharedNotificationsMenu from '../components/SharedNotificationsMenu.vue'
import BrandLogo from '../components/BrandLogo.vue'
import { SHOPPING_COMPLETED_KEEP_MS, useItemsStore } from '../stores/items'
import { getSpaceColor, formatSpaceLabel } from '../models/space'
import SpaceTag from '../components/SpaceTag.vue'
import { useToast } from '../composables/useToast'
import shoppingListEmpty from '../assets/household-icons-by-state/empty-states/shopping-list-empty.svg'
import { profile } from '../stores/profile'
import { getItemIconSrc } from '../assets/household-icons-by-state'
const store = useItemsStore()
const native = useNativeNotificationsStore()
const appToast = inject('appToast', null)
const shoppingPage = ref(null)
const { toast, showToast, hideToast, runUndo } = useToast({ duration: 8000, pauseOnInteraction: true })
const hiddenDemoAllowed = allowsNotificationDemo(location.origin)
let demoToggleBusy = false
async function toggleHiddenDemo() {
  if (!hiddenDemoAllowed || demoToggleBusy) return
  demoToggleBusy = true
  try {
    if (native.demoEnabled) {
      const result = await native.endDemo()
      showToast(result.ok ? '通知展示模式已關閉' : native.demoModeMessage, null, '復原', result.ok ? 'success' : 'error')
      return
    }
    const result = native.activateDemo({ userGesture: true })
    if (!result.ok) { showToast(native.demoModeMessage || '無法啟用通知展示模式。', null, '復原', 'error'); return }
    showToast('通知展示模式已啟用')
    // No await before requesting permission; keep push preferences unchanged.
    const support = native.support()
    if (support.permission === 'default') {
      const authorization = await native.enable({ preservePush: true })
      if (!authorization.ok) showToast(authorization.message, null, '復原', 'error')
    } else if (!support.ok || support.permission !== 'granted') {
      showToast(support.message || '尚未允許系統通知，請在瀏覽器網站設定中允許通知。', null, '復原', 'error')
    }
  } finally { demoToggleBusy = false }
}
const titleGesture = createTitleLongPress(toggleHiddenDemo, { enabled: () => hiddenDemoAllowed && !demoToggleBusy })
const cancelTitleGesture = () => titleGesture.cancel()
onMounted(() => {
  if (!hiddenDemoAllowed) return
  window.addEventListener('pointermove', titleGesture.pointermove)
  window.addEventListener('pointerup', titleGesture.pointerup)
  window.addEventListener('pointercancel', cancelTitleGesture)
  window.addEventListener('scroll', cancelTitleGesture, true)
  window.addEventListener('blur', cancelTitleGesture)
  document.addEventListener('visibilitychange', cancelTitleGesture)
})
onBeforeUnmount(() => {
  titleGesture.dispose()
  window.removeEventListener('pointermove', titleGesture.pointermove)
  window.removeEventListener('pointerup', titleGesture.pointerup)
  window.removeEventListener('pointercancel', cancelTitleGesture)
  window.removeEventListener('scroll', cancelTitleGesture, true)
  window.removeEventListener('blur', cancelTitleGesture)
  document.removeEventListener('visibilitychange', cancelTitleGesture)
})
const snoozeItemId = ref(null)
const snoozeSaving = ref(false)
const snoozeOpen = ref(false)
const snoozeDate = ref('')
const snoozeToday = ref(toDateString())
const currentSnooze = computed(() => store.getItem(snoozeItemId.value)?.reminderSnoozes?.self || '')
const snoozeDateSaved = computed(() => currentSnooze.value > snoozeToday.value && snoozeDate.value === currentSnooze.value)
function snoozeLabel(item) {
  const date = item.reminderSnoozes?.self
  if (!date || date <= store.today) return '延後提醒'
  const [, month, day] = date.split('-')
  return `延至 ${Number(month)}/${Number(day)}`
}
function cancelSnooze(close) {
  const result = store.cancelShoppingReminderSnooze(snoozeItemId.value)
  if (!result.ok) { showToast(result.error.message, null, '復原', 'error'); return }
  showToast('已取消延後提醒')
  close()
}
function openSnooze(item) {
  snoozeSaving.value = false
  snoozeToday.value = toDateString()
  snoozeItemId.value = item.id
  snoozeDate.value = item.reminderSnoozes?.self > snoozeToday.value ? item.reminderSnoozes.self : addDays(snoozeToday.value, 1)
  snoozeOpen.value = true
}
async function saveSnooze() {
  if (snoozeSaving.value) return
  snoozeSaving.value = true
  try {
    const result = await native.saveSnoozeAndScheduleDemo(snoozeItemId.value, snoozeDate.value)
    if (!result.ok) {
      const notify = result.error.code === 'STALE_ITEMS' ? appToast?.showToast || showToast : showToast
      notify(result.error.message, null, '復原', 'error'); snoozeSaving.value = false; return
    }
    const [year, month, day] = snoozeDate.value.split('-').map(Number)
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(year, month - 1, day).getDay()]
    showToast(result.demoResult?.ok === false
      ? `日期已儲存；${result.demoResult.message}` : `已延後提醒至 ${month}/${day} 週${weekday}`)
  } catch { showToast('無法完成此操作，請確認延後日期後重試。', null, '復原', 'error') }
  finally { snoozeSaving.value = false }
}
function completeItem(item) {
  if (item.shoppingCompletedAt != null) {
    store.reopenShoppingItem(item.id)
    hideToast()
    collapsedGroups.value = collapsedGroups.value.filter(id => !['pending', 'claimed', 'shared-claimed'].includes(id))
    return
  }
  const operation = store.completeShoppingItem(item.id)
  if (operation) {
    showToast(`已補貨「${store.getSpace(item.spaceId)?.name || '未指定空間'}」的 ${item.name}`, () => store.undoShoppingOperation(operation))
  }
}
const deleteDialog = ref(null)
const pendingRemovalId = ref(null)
const pendingRemovalItem = computed(() => store.getItem(pendingRemovalId.value))
const removalMessage = computed(() => {
  const item = pendingRemovalItem.value
  if (!item) return ''
  return store.getSpace(item.spaceId)?.shared
    ? `「${item.name}」將從共享清單移除，所有成員都將看不到此項目，用品資料與補貨紀錄仍會保留。`
    : `「${item.name}」將從購買清單移除，用品資料與補貨紀錄仍會保留。`
})
function requestRemoval(item) {
  if (item.shoppingCompletedAt != null) return
  pendingRemovalId.value = item.id
  deleteDialog.value.showModal()
}
function confirmRemoval() {
  const item = pendingRemovalItem.value
  deleteDialog.value.close()
  if (item) removeShoppingItem(item)
  pendingRemovalId.value = null
}
const personalExpandedItems = ref([])
const sharedExpandedItems = ref([])
const expandedItems = computed({
  get: () => (activeTab.value === 'personal' ? personalExpandedItems.value : sharedExpandedItems.value)
    .filter(id => { const item = store.getItem(id); return item && item.shoppingCompletedAt == null }),
  set: value => {
    if (activeTab.value === 'personal') personalExpandedItems.value = value
    else sharedExpandedItems.value = value
  },
})
function toggleCard(event, id) {
  if (event.target.closest('button, input, a, select, textarea, label, .item-controls')) return
  toggleItem(id)
}
function toggleItem(id) {
  const item = store.getItem(id)
  if (!item || item.shoppingCompletedAt != null) return
  expandedItems.value = expandedItems.value.includes(id) ? [] : [id]
}
function changeQuantity(item, delta) {
  if (item.shoppingCompletedAt != null) return
  store.updateItem(item.id, { quantity: Math.max(1, (item.quantity ?? 1) + delta) })
}
function removeShoppingItem(item) {
  const operation = store.removeShoppingEntry(item.id)
  expandedItems.value = expandedItems.value.filter(id => id !== item.id)
  showToast(`已移除「${store.getSpace(item.spaceId)?.name || '未指定空間'}」的 ${item.name}`, () => store.undoShoppingOperation(operation))
}
// 用品詳情【查看清單】帶 ?tab=shared&space=<id>：直接開共享清單並預選該空間。
const route = useRoute()
const router = useRouter()
const fromSharedItem = route.query.tab === 'shared'
const selectedSpace = ref(fromSharedItem && store.getSpace(route.query.space)?.shared ? route.query.space : '')
const activeTab = ref(fromSharedItem ? 'shared' : 'personal')
const notificationSpaceInvalid = ref(false)
watch(() => [route.query.tab, route.query.space], ([tab, space], previous) => {
  if (previous && (tab !== previous[0] || space !== previous[1])) notificationSpaceInvalid.value = false
  activeTab.value = tab === 'shared' ? 'shared' : 'personal'
  selectedSpace.value = store.getSpace(space)?.shared ? space : ''
})
function selectShoppingTab(tab) {
  notificationSpaceInvalid.value = false
  const query = { ...route.query, tab }
  if (tab === 'personal') delete query.space
  router.replace({ name: 'shopping', query })
}
const personalItems = computed(() => store.shoppingList.filter(item => !store.getSpace(item.spaceId)?.shared))
const allSharedItems = computed(() => store.items.filter(item => (item.inShoppingList || item.shoppingCompletedAt != null) && store.getSpace(item.spaceId)?.shared))
const sharedItems = computed(() => notificationSpaceInvalid.value ? [] : allSharedItems.value.filter(item => !selectedSpace.value || selectedSpace.value === item.spaceId))
const pendingSharedSpaces = computed(() => store.sharedSpaces.filter(space => allSharedItems.value.some(item => item.spaceId === space.id && item.inShoppingList)))
watch(pendingSharedSpaces, spaces => { if (selectedSpace.value && !spaces.some(space => space.id === selectedSpace.value) && !allSharedItems.value.some(item => item.spaceId === selectedSpace.value)) selectedSpace.value = '' })
function claimOperation(item, takeOver = false) {
  return takeOver ? store.takeOverShoppingClaim(item.id) : store.claimShoppingItem(item.id)
}
const showClaimAll = computed(() => activeTab.value === 'shared' && unclaimedSpaceItems.value.length > 0)
const unclaimedSpaceItems = computed(() => sharedItems.value.filter(item => item.inShoppingList && !item.shoppingClaimantId))
const claimAllDialog = ref(null)
const claimAllRequest = ref(null)
function requestClaimAll() {
  if (!unclaimedSpaceItems.value.length) return
  claimAllRequest.value = { spaceId: selectedSpace.value, name: selectedSpace.value ? store.getSpace(selectedSpace.value)?.name : '全部空間', ids: unclaimedSpaceItems.value.map(item => item.id) }
  claimAllDialog.value.showModal()
}
function confirmClaimAll() {
  const request = claimAllRequest.value
  if (!request) return
  const operations = request.ids.map(id => {
    const item = store.getItem(id)
    return item && (!request.spaceId || item.spaceId === request.spaceId) && item.inShoppingList && !item.shoppingClaimantId ? claimOperation(item) : null
  }).filter(Boolean)
  sharedExpandedItems.value = sharedExpandedItems.value.filter(id => !request.ids.includes(id))
  if (operations.length) showToast(`已認領「${request.name}」的 ${operations.length}項用品`)
  claimAllDialog.value.close()
}
function sharedSpaceCount(id) { return allSharedItems.value.filter(item => item.spaceId === id).length }
const hasSharedSpace = computed(() => store.sharedSpaces.length > 0)
const claimedItems = computed(() => allSharedItems.value.filter(item => item.inShoppingList && item.shoppingClaimantId === 'self'))
const completedItems = computed(() => store.items.filter(item => item.shoppingCompletedAt != null && item.shoppingCompletedBy === 'self'))
const personalGroups = computed(() => [
  { id: 'pending', title: hasSharedSpace.value ? '個人待買' : '待補貨', items: personalItems.value },
  ...(hasSharedSpace.value ? [{ id: 'claimed', title: '共享認領', items: claimedItems.value }] : []),
  { id: 'completed', title: '已購買', items: completedItems.value },
].filter(group => group.items.length))
const sharedGroups = computed(() => [
  { id: 'shared-pending', title: '待認領', items: sharedItems.value.filter(item => item.inShoppingList && !item.shoppingClaimantId) },
  { id: 'shared-claimed', title: '已認領', items: sharedItems.value.filter(item => item.inShoppingList && item.shoppingClaimantId) },
  { id: 'shared-completed', title: '已購買', items: sharedItems.value.filter(item => item.shoppingCompletedAt != null) },
].filter(group => group.items.length))
const hasMyItems = computed(() => personalGroups.value.some(group => group.items.length))
const myPendingItems = computed(() => [...personalItems.value, ...claimedItems.value])
const restockAllDialog = ref(null)
const restockAllIds = ref([])
function requestRestockAll(items = myPendingItems.value) {
  restockAllIds.value = items.map(item => item.id)
  if (restockAllIds.value.length) restockAllDialog.value.showModal()
}
function confirmRestockAll() {
  restockAll(restockAllIds.value)
  restockAllDialog.value.close()
}
function restockAll(ids = myPendingItems.value.map(item => item.id)) {
  const operations = myPendingItems.value.filter(item => ids.includes(item.id)).map(item => store.completeShoppingItem(item.id)).filter(Boolean)
  if (!operations.length) return
  personalExpandedItems.value = personalExpandedItems.value.filter(id => !operations.some(operation => operation.id === id))
  collapsedGroups.value = collapsedGroups.value.filter(id => id !== 'completed')
  const spaceIds = [...new Set(operations.map(operation => store.getItem(operation.id)?.spaceId))]
  const message = spaceIds.length >= 3
    ? `已補貨 ${spaceIds.length} 個空間，共 ${operations.length} 項用品`
    : `已補貨${spaceIds.map(id => `「${store.getSpace(id)?.name || '未指定空間'}」`).join('、')}的 ${operations.length} 項用品`
  showToast(message, () => {
    operations.forEach(operation => store.undoShoppingOperation(operation))
  })
}
const collapsedGroups = ref([])
let focusGeneration = 0
async function focusNotificationItem() {
  if (route.name !== 'shopping' || typeof route.query.notificationItem !== 'string') return
  const generation = ++focusGeneration
  const id = route.query.notificationItem
  const expectedSpace = typeof route.query.notificationSpace === 'string' ? route.query.notificationSpace : ''
  snoozeOpen.value = false
  for (const dialog of [deleteDialog, restockAllDialog, claimAllDialog, claimDialog]) dialog.value?.close()
  personalExpandedItems.value = []; sharedExpandedItems.value = []
  const item = store.getItem(id)
  const space = item && store.getSpace(item.spaceId)
  const accessible = !space?.shared || store.getSpaceMembers(space.id).some(member => member.id === 'self')
  const resolution = resolveShoppingNotification(item, space, expectedSpace, accessible)
  notificationSpaceInvalid.value = !!item && (!space || !accessible || !!expectedSpace && item.spaceId !== expectedSpace)
  const query = { ...route.query }
  delete query.notificationItem; delete query.notificationSpace; delete query.notificationRequest
  if (resolution.ok) {
    activeTab.value = space.shared ? 'shared' : 'personal'
    selectedSpace.value = space.shared ? space.id : ''
    query.tab = activeTab.value
    if (space.shared) query.space = space.id
    else delete query.space
    const groupId = resolution.completed ? (space.shared ? 'shared-completed' : 'completed')
      : space.shared ? (item.shoppingClaimantId ? 'shared-claimed' : 'shared-pending') : 'pending'
    collapsedGroups.value = collapsedGroups.value.filter(group => group !== groupId)
    if (!resolution.completed) toggleItem(id)
  }
  if (resolution.message) showToast(resolution.message)
  await router.replace({ name: 'shopping', query })
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  if (generation !== focusGeneration || route.name !== 'shopping' || !resolution.ok) return
  const card = [...(shoppingPage.value?.querySelectorAll('[data-shopping-item-id]') || [])]
    .find(element => element.dataset.shoppingItemId === id)
  if (!card) return
  // Wait for the existing expansion/route animations before measuring the card.
  const animations = card.getAnimations?.({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getTiming().iterations)) || []
  await Promise.race([Promise.allSettled(animations.map(animation => animation.finished)), new Promise(resolve => setTimeout(resolve, 600))])
  if (generation !== focusGeneration || route.name !== 'shopping' || activeTab.value !== (space.shared ? 'shared' : 'personal')) return
  window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - 24), behavior: 'instant' })
}
watch(() => [route.query.notificationItem, route.query.notificationRequest], () => {
  if (route.query.notificationItem) focusNotificationItem()
}, { flush: 'post' })
onMounted(focusNotificationItem)
onBeforeUnmount(() => { focusGeneration++ })
function claimItem(item, takeOver = false) {
  const previousClaimant = item.shoppingClaimantId
  claimOperation(item, takeOver)
  if (previousClaimant !== 'self' && item.shoppingClaimantId === 'self') {
    if (!previousClaimant) sharedExpandedItems.value = sharedExpandedItems.value.filter(id => id !== item.id)
    showToast(`已${takeOver ? '接手認領' : '認領'}「${store.getSpace(item.spaceId)?.name || '未指定空間'}」的 ${item.name}`)
  }
}
function cancelClaim(item) {
  const operation = store.cancelShoppingClaim(item.id)
  if (operation) {
    showToast(`已取消認領「${store.getSpace(item.spaceId)?.name || '未指定空間'}」的 ${item.name}`, () => store.undoShoppingOperation(operation))
    collapsedGroups.value = collapsedGroups.value.filter(id => id !== 'shared-pending')
  }
}
const claimDialog = ref(null)
const pendingClaim = ref(null)
const pendingClaimItem = computed(() => store.getItem(pendingClaim.value?.id))
function requestClaimChange(item, action) {
  pendingClaim.value = { id: item.id, action, claimant: item.shoppingClaimantId }
  claimDialog.value.showModal()
}
function confirmClaimChange() {
  const item = pendingClaimItem.value
  const request = pendingClaim.value
  if (item?.inShoppingList && item.shoppingClaimantId === request?.claimant) {
    if (request.action === 'cancel') cancelClaim(item)
    else claimItem(item, request.action === 'takeover')
  }
  claimDialog.value.close()
  pendingClaim.value = null
}
function toggleGroup(id) { collapsedGroups.value = collapsedGroups.value.includes(id) ? collapsedGroups.value.filter(value => value !== id) : [...collapsedGroups.value, id] }
function drawerHeight(element) {
  const content = element.firstElementChild
  const style = getComputedStyle(content)
  return content.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom)
}
function expandGroup(element) {
  element.style.height = '0px'
  element.style.overflow = 'hidden'
  requestAnimationFrame(() => {
    element.style.height = `${drawerHeight(element)}px`
  })
}
function collapseGroup(element) {
  element.style.height = `${drawerHeight(element)}px`
  element.style.overflow = 'hidden'
  void element.offsetHeight
  element.style.height = '0px'
}
function finishGroupAnimation(element) {
  element.style.height = ''
  element.style.overflow = ''
}
let expiryTimer
function scheduleExpiry() {
  clearTimeout(expiryTimer)
  store.clearExpiredShoppingItems()
  const times = store.items.filter(item => item.shoppingCompletedAt != null).map(item => item.shoppingCompletedAt + SHOPPING_COMPLETED_KEEP_MS)
  if (times.length) expiryTimer = setTimeout(scheduleExpiry, Math.max(0, Math.min(...times) - Date.now()))
}
watch(() => store.items.map(item => item.shoppingCompletedAt), scheduleExpiry)
onMounted(() => { scheduleExpiry(); document.addEventListener('visibilitychange', scheduleExpiry) })
onBeforeUnmount(() => { clearTimeout(expiryTimer); document.removeEventListener('visibilitychange', scheduleExpiry) })
function claimStatus(item) {
  if (item.shoppingCompletedAt != null) return '已補貨'
  if (!item.shoppingClaimantId) return '尚未認領'
  const name = item.shoppingClaimantId === 'self' ? profile.name : store.getSpaceMembers(item.spaceId).find(member => member.id === item.shoppingClaimantId)?.name || '成員'
  return `${name}已認領`
}
const iconKeys = { '洗衣精': 'laundry-detergent', '衛生紙': 'tissues', '垃圾袋': 'trash-bags', '洗碗精': 'dish-soap', '狗狗糧食': 'dog-food' }
</script>
<template>
  <section ref="shoppingPage" class="shopping-page" aria-labelledby="shopping-title">
    <header class="shopping-header"><div class="page-brand"><BrandLogo /><h1 id="shopping-title" :data-demo-switch="hiddenDemoAllowed ? '' : undefined" :tabindex="hiddenDemoAllowed ? 0 : undefined" :aria-description="hiddenDemoAllowed ? '長按三秒後放開，或聚焦後按住空白鍵或 Enter 三秒後放開，切換通知展示模式。' : undefined" @pointerdown="titleGesture.pointerdown" @pointerleave="cancelTitleGesture" @keydown="titleGesture.keydown" @keyup="titleGesture.keyup" @blur="cancelTitleGesture" @click.capture="titleGesture.click" @contextmenu="hiddenDemoAllowed && $event.preventDefault()" @selectstart="hiddenDemoAllowed && $event.preventDefault()">購買清單<span class="desktop-breadcrumb"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span class="breadcrumb-current">{{ activeTab === 'shared' ? (store.getSpace(selectedSpace)?.name || '共享清單') : '我的清單' }}</span></span></h1></div><SharedNotificationsMenu /></header>
    <div class="shopping-main">
    <div class="shopping-tabs" role="tablist" aria-label="購買清單類型">
      <button id="personal-shopping-tab" type="button" role="tab" :aria-selected="activeTab === 'personal'" aria-controls="personal-shopping-panel" @click="selectShoppingTab('personal')">我的清單</button>
      <button id="shared-shopping-tab" type="button" role="tab" :aria-selected="activeTab === 'shared'" aria-controls="shared-shopping-panel" @click="selectShoppingTab('shared')">共享清單</button>
    </div>
    <div v-if="activeTab === 'personal'" id="personal-shopping-panel" role="tabpanel" aria-labelledby="personal-shopping-tab">
      <template v-if="hasMyItems">
        <section v-for="group in personalGroups" :key="group.id" class="shopping-group">
          <button v-if="group.id === 'completed'" type="button" class="group-heading" :aria-expanded="!collapsedGroups.includes(group.id)" @click="toggleGroup(group.id)"><span>{{ group.title }} {{ group.items.length }}項</span><span aria-hidden="true">{{ collapsedGroups.includes(group.id) ? '+' : '−' }}</span></button>
          <div v-else class="pending-group-heading"><h2>{{ group.title }} {{ group.items.length }}項</h2><button type="button" class="claim-all-heading-button" @click="requestRestockAll(group.items)">全部標記已買</button></div>
          <p v-if="group.id === 'completed'" class="completed-group-hint">24 小時後移出購買清單</p>
          <Transition name="group-slide" @enter="expandGroup" @leave="collapseGroup" @after-enter="finishGroupAnimation" @after-leave="finishGroupAnimation" @enter-cancelled="finishGroupAnimation" @leave-cancelled="finishGroupAnimation">
          <div v-show="group.id !== 'completed' || !collapsedGroups.includes(group.id)" :id="`shopping-group-${group.id}`" :inert="group.id === 'completed' && collapsedGroups.includes(group.id)"><div class="group-drawer-content">
            <article v-for="item in group.items" :key="item.id" :data-shopping-item-id="item.id" class="shopping-card personal-card" :class="{ completed: group.id === 'completed', expanded: expandedItems.includes(item.id) }" @click="toggleCard($event, item.id)">
              <div class="personal-card-summary">
                <input class="shopping-checkbox" type="checkbox" :checked="group.id === 'completed'"  :aria-label="`${item.name}已補貨`" @change="completeItem(item)" />
                <div class="item-icon-disc" ><img class="item-icon" :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc({ iconPhoto: item.iconPhoto, iconKey: item.iconKey || iconKeys[item.name] }, getReminderStatus(item, store.today, store.remindWithinDays))" alt="" /></div>
                <div class="item-info"><h3>{{ item.name }}</h3><SpaceTag :space-id="item.spaceId" /><p>補貨數量 {{ group.id === 'completed' ? item.shoppingCompletedQuantity : item.quantity ?? 1 }} {{ item.unit }}</p></div>
                <button v-if="item.shoppingCompletedAt == null" type="button" class="item-expand" :aria-expanded="expandedItems.includes(item.id)" :aria-controls="`item-controls-${item.id}`" :aria-label="`${expandedItems.includes(item.id) ? '收起' : '展開'}${item.name}`" @click="toggleItem(item.id)"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
              </div>
              <div class="item-expand-region" :class="{ open: expandedItems.includes(item.id) }" :inert="!expandedItems.includes(item.id)">
                <div class="item-expand-inner" :id="`item-controls-${item.id}`">
                  <div class="item-controls">
                    <div class="quantity-field"><span>補貨數量</span><div class="quantity-stepper"><button type="button" :disabled="item.shoppingCompletedAt != null || (item.quantity ?? 1) <= 1" :aria-label="`減少${item.name}補貨數量`" @click="changeQuantity(item, -1)">−</button><span class="quantity-value">{{ item.shoppingCompletedAt != null ? item.shoppingCompletedQuantity : item.quantity ?? 1 }} <small>{{ item.unit }}</small></span><button type="button" :disabled="item.shoppingCompletedAt != null" :aria-label="`增加${item.name}補貨數量`" @click="changeQuantity(item, 1)">+</button></div></div>
                    <button v-if="group.id === 'claimed'" type="button" class="btn claim-button cancel-claim-button personal-cancel-claim" @click="requestClaimChange(item, 'cancel')"><i class="fa-regular fa-circle-xmark" aria-hidden="true"></i>取消認領</button>
                    <div v-if="item.shoppingCompletedAt == null" class="shopping-secondary-actions">
                    <button type="button" class="remove-shopping-item" :disabled="item.shoppingCompletedAt != null" @click="requestRemoval(item)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i>移除用品</button>
                    <button v-if="item.shoppingCompletedAt == null" type="button" class="btn snooze-reminder-button" @click="openSnooze(item)"><i class="fa-regular fa-clock" aria-hidden="true"></i>{{ snoozeLabel(item) }}</button>
                  </div>
                  </div>
                </div>
              </div>
            </article>
          </div></div>
          </Transition>
        </section>
      </template>
      <div v-else class="shopping-empty" role="status"><div class="empty-disc"><img :src="shoppingListEmpty" alt="" width="48" height="55" /></div><h2>尚未有購買清單</h2><p>將需要補貨的用品加入購買清單，就會顯示在這裡。</p></div>
    </div>
    <div v-else id="shared-shopping-panel" role="tabpanel" aria-labelledby="shared-shopping-tab">
      <div v-if="pendingSharedSpaces.length" class="shared-space-tabs">
        <button type="button" :aria-pressed="!selectedSpace" @click="notificationSpaceInvalid = false; selectedSpace = ''">全部 {{ allSharedItems.length }}</button>
        <button v-for="space in pendingSharedSpaces" :key="space.id" type="button" :aria-pressed="selectedSpace === space.id" :style="{ '--space-color': getSpaceColor(space.color).dark }" :title="space.name" @click="notificationSpaceInvalid = false; selectedSpace = space.id">{{ formatSpaceLabel(space.name) }} {{ sharedSpaceCount(space.id) }}</button>
      </div>
      <section v-for="group in sharedGroups" :key="group.id" class="shopping-group">
        <div v-if="group.id === 'shared-pending'" class="pending-group-heading"><h2>{{ group.title }} {{ group.items.length }}項</h2><button v-if="showClaimAll" type="button" class="claim-all-heading-button" @click="requestClaimAll">全部認領</button></div>
        <button v-else-if="group.id === 'shared-completed'" type="button" class="group-heading" :aria-expanded="!collapsedGroups.includes(group.id)" :aria-controls="`shopping-group-${group.id}`" @click="toggleGroup(group.id)"><span>{{ group.title }} {{ group.items.length }}項</span><span aria-hidden="true">{{ collapsedGroups.includes(group.id) ? '+' : '−' }}</span></button>
        <div v-if="group.id === 'shared-claimed'" class="pending-group-heading"><h2>{{ group.title }} {{ group.items.length }}項</h2></div>
        <p v-if="group.id === 'shared-completed'" class="completed-group-hint">24 小時後移出購買清單</p>
        <Transition name="group-slide" @enter="expandGroup" @leave="collapseGroup" @after-enter="finishGroupAnimation" @after-leave="finishGroupAnimation" @enter-cancelled="finishGroupAnimation" @leave-cancelled="finishGroupAnimation">
          <div v-show="group.id !== 'shared-completed' || !collapsedGroups.includes(group.id)" :id="`shopping-group-${group.id}`" :inert="group.id === 'shared-completed' && collapsedGroups.includes(group.id)"><div class="group-drawer-content">
          <article v-for="item in group.items" :key="item.id" :data-shopping-item-id="item.id" class="shopping-card personal-card shared-card" :class="{ completed: item.shoppingCompletedAt != null, expanded: expandedItems.includes(item.id) }" @click="toggleCard($event, item.id)">
            <div class="personal-card-summary">
              <div class="item-icon-disc" ><img class="item-icon" :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc({ iconPhoto: item.iconPhoto, iconKey: item.iconKey || iconKeys[item.name] }, getReminderStatus(item, store.today, store.remindWithinDays))" alt="" /></div>
              <div class="item-info"><h3>{{ item.name }}</h3><p>{{ store.getSpace(item.spaceId)?.name }}</p><p>補貨數量 {{ item.shoppingCompletedAt != null ? item.shoppingCompletedQuantity : item.quantity ?? 1 }} {{ item.unit }}</p></div>
              <span class="claim-status" :class="{ claimed: item.shoppingClaimantId, restocked: item.shoppingCompletedAt != null }">{{ claimStatus(item) }}</span>
              <button v-if="item.shoppingCompletedAt == null" type="button" class="item-expand" :aria-expanded="expandedItems.includes(item.id)" :aria-controls="`shared-item-controls-${item.id}`" :aria-label="`${expandedItems.includes(item.id) ? '收起' : '展開'}${item.name}`" @click="toggleItem(item.id)"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
            </div>
            <div class="item-expand-region" :class="{ open: expandedItems.includes(item.id) }" :inert="!expandedItems.includes(item.id)">
              <div class="item-expand-inner" :id="`shared-item-controls-${item.id}`">
                <div class="item-controls">
                  <div class="quantity-field"><span>補貨數量</span><div class="quantity-stepper"><button type="button" :disabled="item.shoppingCompletedAt != null || (item.quantity ?? 1) <= 1" :aria-label="`減少${item.name}補貨數量`" @click="changeQuantity(item, -1)">−</button><span class="quantity-value">{{ item.shoppingCompletedAt != null ? item.shoppingCompletedQuantity : item.quantity ?? 1 }} <small>{{ item.unit }}</small></span><button type="button" :disabled="item.shoppingCompletedAt != null" :aria-label="`增加${item.name}補貨數量`" @click="changeQuantity(item, 1)">+</button></div></div>
                  <button v-if="item.inShoppingList && !item.shoppingClaimantId" type="button" class="btn btn-primary claim-button" @click="requestClaimChange(item, 'claim')"><i class="fa-regular fa-hand" aria-hidden="true"></i>我要認領</button>
                  <button v-else-if="item.inShoppingList && item.shoppingClaimantId === 'self'" type="button" class="btn claim-button cancel-claim-button" @click="requestClaimChange(item, 'cancel')"><i class="fa-regular fa-circle-xmark" aria-hidden="true"></i>取消認領</button>
                  <button v-else-if="item.inShoppingList" type="button" class="btn claim-button takeover-button" @click="requestClaimChange(item, 'takeover')"><i class="fa-solid fa-arrow-right-arrow-left" aria-hidden="true"></i>接手認領</button>
                  <div v-if="item.shoppingCompletedAt == null" class="shopping-secondary-actions">
                    <button type="button" class="remove-shopping-item" :disabled="item.shoppingCompletedAt != null" @click="requestRemoval(item)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i>移除用品</button>
                    <button v-if="item.shoppingCompletedAt == null" type="button" class="btn snooze-reminder-button" @click="openSnooze(item)"><i class="fa-regular fa-clock" aria-hidden="true"></i>{{ snoozeLabel(item) }}</button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div></div>
        </Transition>
      </section>
      <div v-if="!sharedItems.length" class="shopping-empty" role="status"><div class="empty-disc"><img :src="shoppingListEmpty" alt="" width="48" height="55" /></div><h2>尚未有共享購買清單</h2><p>共享空間的用品加入清單後，會顯示在這裡。</p></div>
    </div>
    </div>
  </section>
  <Teleport to="body">
    <BottomSheet :open="snoozeOpen" labelledby="snooze-reminder-title" @close="snoozeOpen = false">
      <template #default="{ close }">
        <div class="snooze-reminder-sheet">
          <h2 id="snooze-reminder-title">延後提醒</h2>
          <p class="snooze-personal-hint">僅延後你對此用品的提醒，其他成員不受影響。</p>
          <RestockDateBar v-model="snoozeDate" :today="snoozeToday" :min-date="addDays(snoozeToday, 1)" allow-future expand-upward />
          <button type="button" class="btn btn-primary" :disabled="snoozeSaving" @click="snoozeDateSaved ? close() : saveSnooze()">{{ snoozeSaving ? '儲存中…' : snoozeDateSaved ? '確認' : '儲存' }}</button>
          <div class="snooze-cancel-reveal" :class="{ open: currentSnooze && currentSnooze >= store.today }" :aria-hidden="!(currentSnooze && currentSnooze >= store.today)" :inert="!(currentSnooze && currentSnooze >= store.today)">
            <div class="snooze-cancel-content"><button v-if="currentSnooze && currentSnooze >= store.today" type="button" class="remove-shopping-item snooze-cancel-button" :disabled="snoozeSaving" @click="cancelSnooze(close)">取消延後</button></div>
          </div>
        </div>
      </template>
    </BottomSheet>
    <dialog ref="restockAllDialog" class="shopping-delete-dialog" aria-labelledby="restock-all-title" @close="restockAllIds = []"><form @submit.prevent="confirmRestockAll"><h2 id="restock-all-title">全部標記已買？</h2><p>將 {{ restockAllIds.length }} 項用品標記為已買。</p><div class="shopping-delete-actions"><button type="button" class="btn btn-secondary" autofocus @click="restockAllDialog.close()">取消</button><button type="submit" class="btn btn-primary">確認</button></div></form></dialog>
    <dialog ref="claimAllDialog" class="shopping-delete-dialog" aria-labelledby="claim-all-title" @close="claimAllRequest = null"><form @submit.prevent="confirmClaimAll"><h2 id="claim-all-title">全部認領 {{ claimAllRequest?.ids.length }} 項？</h2><p>將認領「{{ claimAllRequest?.name }}」中的{{ claimAllRequest?.ids.length }}項用品。</p><div class="shopping-delete-actions"><button type="button" class="btn btn-secondary" autofocus @click="claimAllDialog.close()">取消</button><button type="submit" class="btn btn-primary">認領</button></div></form></dialog>
    <dialog ref="claimDialog" class="shopping-delete-dialog" aria-labelledby="claim-change-title" @close="pendingClaim = null">
      <form @submit.prevent="confirmClaimChange">
        <h2 id="claim-change-title">{{ pendingClaim?.action === 'cancel' ? '取消認領？' : pendingClaim?.action === 'takeover' ? '接手認領？' : '認領用品？' }}</h2>
        <p v-if="pendingClaim?.action === 'takeover'">確定要接手「{{ store.getSpace(pendingClaimItem?.spaceId)?.name || '未指定空間' }}」的{{ pendingClaimItem?.name }}嗎？</p>
        <p v-else-if="pendingClaim?.action === 'cancel'">確定要取消「{{ store.getSpace(pendingClaimItem?.spaceId)?.name || '未指定空間' }}」的{{ pendingClaimItem?.name }}認領嗎？</p>
        <p v-else>確定要認領「{{ pendingClaimItem?.name }}」嗎？</p>
        <div class="shopping-delete-actions"><button type="button" class="btn btn-secondary" autofocus @click="claimDialog.close()">取消</button><button type="submit" class="btn" :class="pendingClaim?.action === 'cancel' ? 'btn-danger' : 'btn-primary'">{{ pendingClaim?.action === 'cancel' ? '取消認領' : pendingClaim?.action === 'takeover' ? '接手認領' : '認領' }}</button></div>
      </form>
    </dialog>
    <dialog ref="deleteDialog" class="shopping-delete-dialog" aria-labelledby="shopping-delete-title" aria-describedby="shopping-delete-message" @close="pendingRemovalId = null">
      <form @submit.prevent="confirmRemoval">
        <h2 id="shopping-delete-title">移除用品？</h2>
        <p id="shopping-delete-message">{{ removalMessage }}</p>
        <div class="shopping-delete-actions"><button type="button" class="btn btn-secondary" autofocus @click="deleteDialog.close()">取消</button><button type="submit" class="btn btn-danger">移除</button></div>
      </form>
    </dialog>
    <AppToast :toast="toast" @undo="runUndo" />
  </Teleport>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/page-header' as ph;
.shopping-main { min-width: 0; }
.desktop-breadcrumb { display: none; }
.shopping-page { width: 100%; max-width: 358px; margin-inline: auto; padding-top: t.$space-16; text-align: left; font-family: t.$font-family; color: t.$text-main; }
.shopping-page.with-claim-all { padding-bottom: calc(t.$button-height + t.$space-32); }
.claim-all-bar { position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1000; width: min(273.6px, calc((100% - 48px) * .8)); .btn { width: 100%; min-height: t.$button-height; } }
.shopping-header { @include ph.page-header; align-items: center; }
.page-brand { @include ph.page-brand; }
h1 { @include ph.page-title; }
#shopping-title[data-demo-switch] { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.inline-claim-all { margin-bottom: t.$space-16; .btn { width: 100%; min-height: t.$button-height; background: t.$primary-soft; color: t.$primary-green; box-shadow: t.$shadow-raised; } .btn:disabled { background: t.$text-disabled; color: t.$text-inverse; box-shadow: none; opacity: 1; } }
.shopping-tabs { display: flex; box-sizing: border-box; min-height: 46px; padding: 3px; margin-bottom: t.$space-16; border-radius: t.$radius-popover; background: t.$surface-bg; button { flex: 1; min-width: 0; min-height: 40px; padding: 0 t.$space-8; border: 0; border-radius: t.$radius-popover; background: transparent; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family; cursor: pointer; &[aria-selected="true"] { background: t.$primary-soft; color: t.$primary-green; font-weight: t.$font-weight-medium; box-shadow: t.$shadow-added; } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; } } }
.shopping-empty { display: flex; flex-direction: column; align-items: center; padding-top: max(64px, calc(36dvh - 126px)); text-align: center; h2 { margin: 19px 0 2px; font: t.$font-weight-bold #{t.$font-size-heading} / 30px t.$font-family; } p { max-width: 318px; margin: 0; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family; } }
.empty-disc { display: grid; place-items: center; width: 88px; height: 88px; border-radius: 50%; background: t.$primary-soft; box-shadow: t.$shadow-added; img { display: block; } }
h2 { margin: 0 0 16px; font: 700 16px / 22px t.$font-family; }
.shopping-card { display: flex; align-items: flex-start; gap: t.$space-12; padding: t.$space-24 t.$space-20; margin-bottom: t.$space-16; background: t.$card-bg; border-radius: t.$radius-card; box-shadow: t.$shadow-card; }
.item-icon { width: 56px; height: 56px; object-fit: contain; }
.item-info { display: flex; flex-direction: column; gap: t.$space-8; min-width: 0; h3 { margin: 0; font: t.$font-weight-bold #{t.$font-size-heading} / #{t.$line-height-app-bar} t.$font-family; } p { margin: 0; font-size: t.$font-size-body-sm; color: t.$text-sub; } }
.pending-group-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: t.$space-16; h2 { margin: 0; color: t.$text-sub; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; } }
.claim-all-heading-button { padding: t.$space-8 t.$space-12; border: 0; border-radius: t.$radius-pill; background: t.$primary-soft; box-shadow: t.$shadow-raised; color: t.$primary-green; font: t.$font-weight-bold #{t.$font-size-body-sm} / normal t.$font-family; cursor: pointer; }
.shared-space-tabs { scrollbar-width: none; &::-webkit-scrollbar { display: none; } display: flex; gap: t.$space-8; overflow-x: auto; margin-bottom: t.$space-16; padding-block: 4px; button { --space-color: #{t.$primary-green}; flex-shrink: 0; box-sizing: border-box; min-width: 74px; height: 34px; padding: 0 t.$space-12; border: 1px solid var(--space-color); background: transparent; color: var(--space-color); font: t.$font-weight-medium #{t.$font-size-metadata} / #{t.$line-height-body} t.$font-family; cursor: pointer; border-radius: t.$radius-pill; } button[aria-pressed="true"] { border-color: transparent; background: var(--space-color); color: t.$text-inverse; outline: none; } button:focus-visible { outline: 2px solid t.$text-main; outline-offset: 2px; } }

.empty-message { color: t.$text-sub; font-size: 14px; }
.group-slide-enter-active, .group-slide-leave-active { transition: height .5s ease; }
.group-drawer-content { display: flow-root; padding: t.$space-24; margin: calc(-1 * t.$space-24); }
.group-slide-enter-active .group-drawer-content, .group-slide-leave-active .group-drawer-content { transition: transform .5s ease; }
.group-slide-enter-from .group-drawer-content, .group-slide-leave-to .group-drawer-content { transform: translateY(-100%); }
.group-slide-enter-to .group-drawer-content, .group-slide-leave-from .group-drawer-content { transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .group-slide-enter-active, .group-slide-leave-active, .group-slide-enter-active .group-drawer-content, .group-slide-leave-active .group-drawer-content { transition: none; } }
.shopping-group { margin-top: t.$space-24; }
.group-heading { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: t.$space-16; padding: 0; border: 0; background: transparent; color: t.$text-sub; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; cursor: pointer; }
.completed-group-hint { margin: calc(-1 * t.$space-8) 0 t.$space-16; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-caption} / #{t.$line-height-body} t.$font-family; }
.shopping-checkbox { appearance: none; box-sizing: border-box; flex: 0 0 32px; width: 32px; height: 32px; margin: 8px 0 0; border: 1.5px solid t.$text-disabled; border-radius: 10px; background: t.$input-bg; box-shadow: t.$shadow-raised; cursor: pointer; &:checked { background: t.$primary-green; border-color: t.$primary-green; position: relative; &::after { content: ''; position: absolute; left: 10px; top: 5px; width: 8px; height: 14px; border: solid t.$text-inverse; border-width: 0 2px 2px 0; transform: rotate(45deg); } } &:disabled { cursor: default; } }
.group-empty { margin: 0 0 t.$space-16; color: t.$text-disabled; font-size: t.$font-size-body-sm; }
.shopping-card.completed { opacity: .68; }
.claim-button { min-height: t.$button-height-compact; font-size: t.$font-size-body-sm; }
.personal-card { display: block; padding: 0 t.$space-24; transition: box-shadow .5s ease; }
// 與首頁 ReminderCard 選取樣式一致：內側 1.5px 淺綠框，保留卡片陰影。
.personal-card.expanded { box-shadow: t.$shadow-card, inset 0 0 0 1.5px #9db59a; }
.personal-card-summary { position: relative; display: grid; grid-template-columns: 32px 52px minmax(0, 1fr); align-items: start; column-gap: t.$space-12; min-height: calc(t.$button-height + t.$space-24 * 2 + t.$space-24); box-sizing: border-box; padding-block: t.$space-24; padding-right: t.$space-32; }
.personal-card .shopping-checkbox { margin-top: 10px; }
.item-icon-disc { display: grid; place-items: center; width: 52px; height: 52px; border-radius: t.$radius-pill; background: t.$icon-circle-bg; box-shadow: inset -2.308px -2.308px 4.615px rgba(255, 255, 255, .9), inset 2.308px 2.308px 4.615px rgba(184, 131, 90, .22); }
.personal-card .item-icon { width: 48px; height: 48px; }
.personal-card .item-info { gap: 2px; h3 { font-size: t.$font-size-card-title; line-height: t.$line-height-app-bar; overflow-wrap: anywhere; } p { font-size: t.$font-size-metadata; line-height: t.$line-height-body; } }
.personal-card :deep(.space-tag) { font-size: t.$font-size-caption; line-height: 14px; padding-block: 3px; }
.item-expand { position: absolute; top: t.$space-16; right: 0; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: t.$radius-input; color: t.$text-disabled; background: t.$input-bg; box-shadow: t.$shadow-raised; cursor: pointer; i { font-size: t.$font-size-caption; transition: transform .5s ease; } }
.expanded .item-expand i { transform: rotate(180deg); }
.item-expand-region { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s ease; &.open { grid-template-rows: 1fr; } }
.item-expand-inner { min-height: 0; overflow: hidden; padding: 10px; margin: -10px; }
.item-controls { border-top: 1px solid t.$border-color; padding-top: t.$space-20; padding-bottom: t.$space-20; }
.quantity-field { display: flex; align-items: center; justify-content: space-between; gap: t.$space-8; min-height: 72px; padding-inline: t.$space-20; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-sub; font-size: t.$font-size-body-sm; }
.quantity-stepper { display: flex; align-items: center; gap: t.$space-12; button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: t.$radius-pill; color: t.$primary-green; background: t.$input-bg; box-shadow: t.$shadow-raised; font-size: t.$font-size-page-title; cursor: pointer; &:disabled { color: t.$text-disabled; cursor: default; } } }
.quantity-value { color: t.$text-main; font-size: t.$font-size-heading; font-weight: t.$font-weight-bold; white-space: nowrap; small { color: t.$text-sub; font-size: t.$font-size-body-sm; font-weight: t.$font-weight-regular; } }
.remove-shopping-item { display: flex; align-items: center; justify-content: center; gap: t.$space-8; width: 100%; min-height: 36px; margin-top: t.$space-12; padding: 0; border: 0; background: transparent; color: t.$danger; font: t.$font-weight-medium #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family; cursor: pointer; }
.remove-shopping-item:disabled { color: t.$text-disabled; cursor: default; }
@media (prefers-reduced-motion: reduce) { .personal-card, .item-expand i, .item-expand-region, .item-icon-disc { transition: none; } }
.shared-card .personal-card-summary { grid-template-columns: 52px minmax(0, 1fr); }
.shared-card .personal-card-summary { padding-right: 118px; }
.claim-status { position: absolute; top: t.$space-24; right: 46px; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 10px; border-radius: t.$radius-md; background: t.$text-sub; color: t.$text-inverse; font: t.$font-weight-medium #{t.$font-size-caption} / 14px t.$font-family; &.claimed { background: t.$primary-green; } &.restocked { background: t.$success; } }
.personal-cancel-claim { display: flex; align-items: center; justify-content: center; gap: t.$space-8; width: 100%; min-height: t.$button-height; margin-top: t.$space-20; font-size: t.$font-size-button; }
.shared-card .claim-button { display: flex; align-items: center; justify-content: center; gap: t.$space-8; width: 100%; min-height: t.$button-height; margin-top: t.$space-20; font-size: t.$font-size-button; }
.cancel-claim-button { background: t.$feedback-error-subtle; color: t.$danger; border: 0; box-shadow: t.$shadow-raised; }
.takeover-button { background: t.$primary-soft; color: t.$primary-green; border: 1px solid t.$border-active; box-shadow: t.$shadow-raised; }
.shopping-delete-dialog {
  width: min(300px, calc(100% - t.$space-16 * 2));
  margin: auto;
  max-height: calc(100dvh - t.$space-16 * 2);
  padding: t.$space-24 18px;
  border: 0;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  color: t.$text-main;
  box-shadow: 0 14px 16px rgba(140, 136, 127, .2);
  text-align: center;
  &::backdrop { background: rgba(t.$text-main, .35); }
  &:focus { outline: none; }
  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold #{t.$font-size-card-title} / 1.45 t.$font-family; overflow-wrap: anywhere; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-body} / 1.45 t.$font-family; overflow-wrap: anywhere; }
}
.shopping-delete-actions {
  display: flex;
  gap: t.$space-12;
  margin-top: t.$space-32;
  .btn { flex: 1; min-width: 0; height: t.$button-height; padding: 0 t.$space-24; border: 0; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body} / normal t.$font-family; cursor: pointer; &:focus { outline: none; } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; } }
  .btn-secondary { background: t.$input-bg; box-shadow: t.$shadow-raised; color: t.$text-button-secondary; &:focus, &:focus-visible { outline: none; } }
  .btn-danger { background: t.$danger; box-shadow: t.$shadow-primary; color: t.$text-inverse; }
}
@media (prefers-reduced-motion: reduce) { .item-toast-enter-active, .item-toast-leave-active { transition: none; } }

.shopping-delete-dialog .shopping-delete-actions { display: flex; gap: t.$space-12; margin-top: t.$space-32; }
.shopping-delete-dialog .shopping-delete-actions .btn { flex: 1; min-width: 0; height: t.$button-height; min-height: t.$button-height; padding: 0 t.$space-24; border: 0; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body} / normal t.$font-family; }
.shopping-delete-dialog .shopping-delete-actions .btn-secondary { background: t.$input-bg; color: t.$text-button-secondary; box-shadow: t.$shadow-raised; }
.shopping-delete-dialog .shopping-delete-actions button:focus { outline: none; }
.shopping-delete-dialog .shopping-delete-actions button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.shopping-delete-dialog .shopping-delete-actions .btn-secondary:focus, .shopping-delete-dialog .shopping-delete-actions .btn-secondary:focus-visible { outline: none; }
</style>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.snooze-reminder-button { display: flex; align-items: center; justify-content: center; gap: t.$space-8; width: 100%; background: t.$primary-soft; color: t.$primary-green; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family; }
.shopping-secondary-actions {
  display: flex; align-items: stretch; gap: t.$space-12; margin-top: t.$space-16;
  > button { flex: 1 1 0; min-width: 0; width: auto; min-height: t.$button-height; margin: 0; }
  .remove-shopping-item { border-radius: t.$radius-pill; }
}
:is(.snooze-reminder-button, .takeover-button) {
  --bs-btn-color: #{t.$primary-green};
  --bs-btn-hover-color: #{t.$primary-green};
  --bs-btn-active-color: #{t.$primary-green};
  --bs-btn-hover-bg: #{t.$primary-soft};
  --bs-btn-active-bg: #{t.$primary-soft};
  --bs-btn-hover-border-color: transparent;
  --bs-btn-active-border-color: transparent;
  --bs-btn-active-shadow: none;
}
.takeover-button { --bs-btn-hover-border-color: #{t.$border-active}; --bs-btn-active-border-color: #{t.$border-active}; }
.cancel-claim-button {
  --bs-btn-color: #{t.$danger};
  --bs-btn-hover-color: #{t.$danger};
  --bs-btn-active-color: #{t.$danger};
  --bs-btn-hover-bg: #{t.$feedback-error-subtle};
  --bs-btn-active-bg: #{t.$feedback-error-subtle};
  --bs-btn-hover-border-color: transparent;
  --bs-btn-active-border-color: transparent;
  --bs-btn-active-shadow: none;
}
.snooze-reminder-sheet { display: flex; flex-direction: column; gap: 16px; h2 { margin: 0; font: 700 17px / 24px t.$font-family; } p { margin: 0; color: t.$text-sub; } }
.snooze-reminder-sheet .snooze-personal-hint { font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.snooze-reminder-sheet > .btn-primary { margin-top: t.$space-8; }
.snooze-cancel-button { min-height: 44px; margin-top: 0; border-radius: t.$radius-pill; font: t.$font-weight-bold #{t.$font-size-button} / 24px t.$font-family; }
@media (min-width: 1024px) and (hover: hover) and (pointer: fine) { .snooze-reminder-button:not(:disabled):hover { background: #d5e2d0; color: t.$primary-green; } }
</style>

<style scoped>
.snooze-cancel-reveal { display: grid; grid-template-rows: 0fr; margin-top: -16px; opacity: 0; transition: grid-template-rows .35s ease, margin-top .35s ease, opacity .25s ease; }
.snooze-cancel-reveal.open { grid-template-rows: 1fr; margin-top: -8px; opacity: 1; }
/* 保留陰影空間，負 margin 抵銷 padding，不改變按鈕位置與展開高度。 */
.snooze-cancel-content { min-height: 0; overflow: hidden; padding: 10px; margin: -10px; }
.snooze-cancel-content > button { width: 100%; }
@media (prefers-reduced-motion: reduce) { .snooze-cancel-reveal { transition: none; } }
@media (max-width: 1023px) {
  :global(dialog[aria-labelledby="snooze-reminder-title"]:has(.snooze-cancel-reveal.open)) {
    padding-bottom: max(24px, env(safe-area-inset-bottom));
    transition: padding-bottom .35s ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  :global(dialog[aria-labelledby="snooze-reminder-title"]) { transition: none; }
}
</style>
