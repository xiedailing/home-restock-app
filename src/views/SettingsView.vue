<script setup>
import { storeToRefs } from 'pinia'
import { useNotificationSettingsStore } from '../stores/notificationSettings'
import AppToast from '../components/AppToast.vue'
import { useToast } from '../composables/useToast'
import { isValidInviteCode } from '../utils/inviteCode'
import { computed, ref, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { getSpaceColor } from '../models/space'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import reminderIcon from '../assets/settings/reminder.svg'
import spacesIcon from '../assets/settings/spaces.svg'
import categoriesIcon from '../assets/settings/categories.svg'
import chevron from '../assets/settings/chevron.svg'
import reminderChevronUp from '../assets/settings/reminder-chevron-up.svg'
import reminderCheck from '../assets/settings/reminder-check.svg'
import SwitchTrack from '../components/SwitchTrack.vue'

// 先使用畫面範例資料，之後可改由帳號／設定 store 提供。
const emit = defineEmits(['open-categories', 'logout'])
const store = useItemsStore()
const route = useRoute()
const router = useRouter()
const settingsViewKey = 'settings-space-return-view'
const restoringView = ref(false)
function rememberSpaceView() {
  try {
    sessionStorage.setItem(settingsViewKey, JSON.stringify({
      remainingSpacesExpanded: remainingSpacesExpanded.value, expandedSpaceGroups: expandedSpaceGroups.value,
      expandedReminder: expandedReminder.value,
      reminderModes: reminderModes.value, customDays: customDays.value,
      restockDays: restockDays.value, shoppingDays: shoppingDays.value,
    }))
  } catch { /* 無法使用 sessionStorage 時仍可正常導覽。 */ }
}
onBeforeRouteLeave(() => { rememberSpaceView() })
onBeforeMount(() => {
  let saved
  try { saved = JSON.parse(sessionStorage.getItem(settingsViewKey) || 'null'); sessionStorage.removeItem(settingsViewKey) } catch { return }
  if (!saved) return
  remainingSpacesExpanded.value = !!saved.remainingSpacesExpanded
  expandedSpaceGroups.value = saved.expandedSpaceGroups || { personal: true, shared: true }
  expandedReminder.value = saved.expandedReminder || ''
  reminderModes.value = saved.reminderModes
  customDays.value = saved.customDays
  restockDays.value = saved.restockDays
  shoppingDays.value = saved.shoppingDays

})
const remainingSpacesExpanded = ref(false)
const expandedSpaceGroups = ref({ personal: true, shared: true })
const spaceGroups = computed(() => [
  { id: 'personal', label: '個人空間', spaces: store.spaces.filter(space => !space.shared) },
  { id: 'shared', label: '共享空間', spaces: store.spaces.filter(space => space.shared) },
].filter(group => group.spaces.length))
const inviteCode = ref('')
const validInviteCode = computed(() => isValidInviteCode(inviteCode.value))
function joinSpace() {
  if (!validInviteCode.value) return
  const result = store.joinSpaceByCode(inviteCode.value)
  if (result.reason === 'duplicate-name') {
    duplicateJoinName.value = result.spaceName
    editing.value = 'duplicate-space'
    dialog.value.showModal()
    return
  }
  showNotice(result.message, !result.ok)
  if (result.ok) inviteCode.value = ''
}
const { pushEnabled: notifications } = storeToRefs(useNotificationSettingsStore())
const restockDays = ref(5)
const shoppingDays = ref(5)
const expandedReminder = ref('')
function closeReminderOutside(event) {
  if (!event.target.closest('[data-reminder-control]')) closeReminder()
}
onMounted(() => {
  document.addEventListener('pointerdown', closeReminderOutside)
  if (route.query.spaceCreated) {
    const created = store.getSpace(route.query.createdSpaceId)
    createdToastTimer = setTimeout(() => showNotice('已成功新增空間', false, created?.shared ? 'invite' : '', 5000), 300)
  } else if (route.query.spaceLeft) showNotice(`已退出「${route.query.spaceLeft}」空間`, false, 'exit')
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeReminderOutside))
const reminderModes = ref({ restock: '5', shopping: '5' })
const reminderOptions = [
  { value: '5', label: '提前5天' },
  { value: '7', label: '提前7天' },
  { value: 'custom', label: '自訂天數' },
  { value: 'off', label: '不要提醒' },
]
const customDays = ref({ restock: '', shopping: '' })
function reminderSummary(type) {
  if (!notifications.value) return '不要提醒'
  const mode = reminderModes.value[type]
  if (mode === 'off') return '不要提醒'
  const days = mode === 'custom' ? Number(customDays.value[type]) : Number(mode)
  if (!Number.isSafeInteger(days) || days <= 0) return '自訂天數'
  return `${type === 'shopping' ? '加入後' : '提前'} ${days} 天`
}
const previousCustomSettings = ref({ restock: null, shopping: null })
function customPending(type) {
  return reminderModes.value[type] === 'custom' && customDays.value[type] === ''
}
function restoreUnselectedCustom(type) {
  const previous = previousCustomSettings.value[type]
  if (!customPending(type) || !previous) return
  reminderModes.value[type] = previous.mode
  customDays.value[type] = previous.days
  previousCustomSettings.value[type] = null
}
function closeReminder() {
  if (expandedReminder.value) restoreUnselectedCustom(expandedReminder.value)
  expandedReminder.value = ''
}
function toggleReminder(type) {
  if (expandedReminder.value === type) {
    if (!customPending(type)) closeReminder()
    return
  }
  closeReminder()
  expandedReminder.value = type
}
function chooseReminder(type, value) {
  if (value === 'custom' && reminderModes.value[type] !== 'custom') {
    previousCustomSettings.value[type] = { mode: reminderModes.value[type], days: customDays.value[type] }
    customDays.value[type] = ''
  } else if (value !== 'custom') {
    previousCustomSettings.value[type] = null
  }
  reminderModes.value[type] = value
  if (value === 'custom') {
    expandedReminder.value = type
    return
  }
  if (reminderModes.value.restock === 'off' && reminderModes.value.shopping === 'off') notifications.value = false
  else if (value !== 'off') notifications.value = true
  if (value === '5' || value === '7') {
    if (type === 'restock') restockDays.value = Number(value)
    else shoppingDays.value = Number(value)
  }
}
function updateCustomDays(type, event) {
  const days = Number(event.target.value)
  if (!Number.isInteger(days) || days < 1 || days > 20) return
  customDays.value[type] = String(days)
  previousCustomSettings.value[type] = null
  notifications.value = true
  if (type === 'restock') restockDays.value = days
  else shoppingDays.value = days
}
const dialog = ref(null)
const editing = ref('')
const duplicateJoinName = ref('')

const { toast, showToast, hideToast, runUndo } = useToast()
const noticeIsWarning = ref(false)
const noticeAction = ref('')
let createdToastTimer
function openCreatedInvite() {
  const created = store.getSpace(route.query.createdSpaceId)
  if (!created?.shared) return
  rememberSpaceView()
  hideToast()
  router.push({ name: 'edit-space', params: { spaceId: created.id }, query: { from: 'settings', invite: '1' } })
}
function showNotice(message, warning = false, action = '') {
  noticeAction.value = action
  noticeIsWarning.value = warning
  showToast(message, action === 'invite' ? openCreatedInvite : null, '邀請成員')
}
onBeforeUnmount(() => clearTimeout(createdToastTimer))
const dialogTitle = computed(() => editing.value === 'logout' ? '確認登出' : '已有相同名稱的空間')

function openEditor(type) {
  editing.value = type
  dialog.value.showModal()
}

function saveChanges() {
  if (editing.value === 'logout') {
    emit('logout')
    router.replace({ name: 'login' })
  }
  dialog.value.close()
}

</script>

<template>
  <section class="settings-page" :class="{ 'restoring-view': restoringView }" aria-labelledby="settings-title">
    <header class="settings-header">
      <h1 id="settings-title">設定</h1>
    </header>

    <div class="profile">
      <div class="avatar-holder">
        <img class="uploaded-profile-avatar" :src="profile.avatar || defaultAvatar" alt="個人頭像" />
      </div>
      <div class="profile-info">
        <p class="profile-name">{{ profile.name }}</p>
        <p class="profile-email">{{ profile.email }}</p>
        <RouterLink :to="{ name: 'edit-profile' }" class="edit-profile-link">編輯個人檔案</RouterLink>
      </div>
    </div>

    <section class="settings-section" aria-labelledby="reminder-title">
      <h2 id="reminder-title"><img :src="reminderIcon" alt="" />提醒設定</h2>
      <div class="card settings-card">
        <div class="notification-section">
        <div class="settings-row">
          <span>推播通知</span>
          <button type="button" class="notification-switch" role="switch" :aria-checked="notifications" aria-label="推播通知" @click="notifications = !notifications">
            <SwitchTrack :checked="notifications" />
          </button>
        </div>
        <div class="notification-hint-collapse" :class="{ expanded: !notifications }" :aria-hidden="notifications"><div class="notification-hint-inner"><p class="phone-notification-hint">關閉後仍會保留補貨日期與紀錄。</p></div></div>
        </div>
        <template v-for="reminder in [{ type: 'restock', label: '補貨建議' }, { type: 'shopping', label: '購買清單提醒' }]" :key="reminder.type">
          <button type="button" class="settings-row" :class="{ 'last-reminder-row': reminder.type === 'shopping' }" data-reminder-control :aria-expanded="expandedReminder === reminder.type" :aria-controls="`reminder-options-${reminder.type}`" @click="toggleReminder(reminder.type)">
            <span>{{ reminder.label }}</span>
            <span class="row-value" :class="{ 'notification-muted': !notifications || reminderModes[reminder.type] === 'off' }">{{ reminderSummary(reminder.type) }}</span>
            <img class="chevron" :src="expandedReminder === reminder.type ? reminderChevronUp : chevron" alt="" />
          </button>
          <div class="reminder-collapse" data-reminder-control :class="{ expanded: expandedReminder === reminder.type }" :inert="expandedReminder !== reminder.type">
            <div class="reminder-collapse-content">
              <div :id="`reminder-options-${reminder.type}`" class="reminder-expand" :class="{ 'last-reminder-expand': reminder.type === 'shopping' }">
                <div class="reminder-options" role="group" :aria-label="reminder.label + '天數'">
                  <button v-for="option in reminderOptions" :key="option.value" type="button" class="reminder-option" :class="{ selected: reminderModes[reminder.type] === option.value }" :aria-pressed="reminderModes[reminder.type] === option.value" @click="chooseReminder(reminder.type, option.value)">
                    <span>{{ reminder.type === 'shopping' && ['5', '7'].includes(option.value) ? `加入後${option.value}天` : option.label }}</span><img v-if="reminderModes[reminder.type] === option.value" :src="reminderCheck" alt="" />
                  </button>
                </div>
                <div v-if="reminderModes[reminder.type] === 'custom'" class="custom-reminder" :class="{ 'needs-value': customPending(reminder.type) }">
                  <label :for="`custom-days-${reminder.type}`">自訂天數 <span class="required">*</span><span class="custom-days-value">{{ customDays[reminder.type] ? `${customDays[reminder.type]} 天` : '請選擇天數' }}</span></label>
                  <input :id="`custom-days-${reminder.type}`" type="range" min="1" max="20" step="1" :style="{ '--range-progress': `${((Number(customDays[reminder.type] || 1) - 1) / 19) * 100}%` }" :value="customDays[reminder.type] || 1" :aria-invalid="customPending(reminder.type)" :aria-describedby="customPending(reminder.type) ? `custom-days-error-${reminder.type}` : undefined" :aria-valuetext="customDays[reminder.type] ? `${customDays[reminder.type]} 天` : '尚未選擇天數'" @input="updateCustomDays(reminder.type, $event)" @change="updateCustomDays(reminder.type, $event)" @pointerup="updateCustomDays(reminder.type, $event)" />
                  <div class="range-limits" aria-hidden="true"><span>1 天</span><span>20 天</span></div>
                  <p v-if="customPending(reminder.type)" :id="`custom-days-error-${reminder.type}`" class="custom-days-error">請選擇 1～20 天，未選擇將保留原本設定。</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="spaces-title">
      <h2 id="spaces-title"><img :src="spacesIcon" alt="" />空間管理</h2>
      <div class="card settings-card">
        <div id="settings-spaces-list" class="settings-spaces-list">
          <section v-for="group in spaceGroups" :key="group.id" class="settings-space-group" :aria-labelledby="`space-group-${group.id}`">
            <button type="button" class="space-group-heading" :aria-expanded="expandedSpaceGroups[group.id]" :aria-controls="`space-group-list-${group.id}`" @click="expandedSpaceGroups[group.id] = !expandedSpaceGroups[group.id]"><span :id="`space-group-${group.id}`">{{ group.label }}<span v-if="!expandedSpaceGroups[group.id]" class="collapsed-space-count">{{ group.spaces.length }} 個</span></span><span aria-hidden="true">{{ expandedSpaceGroups[group.id] ? '−' : '+' }}</span></button>
            <div class="reminder-collapse spaces-drawer" :class="{ expanded: expandedSpaceGroups[group.id] }" :inert="!expandedSpaceGroups[group.id]">
              <div :id="`space-group-list-${group.id}`" class="reminder-collapse-content">
                <div class="sortable-spaces">
            <RouterLink v-for="space in group.spaces" :key="space.id" @click="rememberSpaceView" :to="{ name: 'edit-space', params: { spaceId: space.id }, query: { from: 'settings' } }" class="settings-row"><span class="settings-space-dot" :style="{ backgroundColor: getSpaceColor(space.color).dark }" aria-hidden="true"></span><span class="settings-space-name">{{ space.name }}</span><span v-if="space.shared" class="settings-member-count">{{ store.getSpaceMembers(space.id).length }} 人</span><img class="chevron" :src="chevron" alt="" /></RouterLink>
                </div>
              </div>
            </div>
          </section>
            <div class="settings-add-space"><RouterLink :to="{ name: 'add-space', query: { from: 'settings' } }" class="add-space-link">＋ 新增空間</RouterLink></div>
        </div>
        <form class="settings-join-space" @submit.prevent="joinSpace">
          <label for="settings-invite-code">加入空間</label>
          <div class="settings-join-controls"><input id="settings-invite-code" v-model="inviteCode" placeholder="輸入空間邀請碼" autocomplete="off" maxlength="8" /><button type="submit" class="btn btn-primary" :disabled="!validInviteCode">加入</button></div>
        </form>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="categories-title">
      <h2 id="categories-title"><img :src="categoriesIcon" alt="" />用品管理</h2>
      <div class="card settings-card settings-card-pill">
        <RouterLink :to="{ name: 'item-management' }" class="settings-row item-management-link">
          <span>查看分類</span><img class="chevron" :src="chevron" alt="" />
        </RouterLink>
      </div>
    </section>

    <button type="button" class="btn btn-danger-subtle logout-button" @click="openEditor('logout')">登出</button>
    <AppToast :toast="toast" @undo="runUndo"><template v-if="noticeIsWarning || noticeAction === 'exit'" #icon><i :class="noticeIsWarning ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-arrow-right-from-bracket'" class="notice-icon" aria-hidden="true"></i></template></AppToast>

    <dialog ref="dialog" class="settings-dialog" :class="{ 'duplicate-space-dialog': editing === 'duplicate-space' }" aria-labelledby="settings-dialog-title">
      <form @submit.prevent="saveChanges">
        <h2 id="settings-dialog-title">{{ dialogTitle }}</h2>
        <p v-if="editing === 'logout'">確定要登出嗎？</p>
        <p v-else>已有「{{ duplicateJoinName }}」空間。<br />請先修改其中一個空間名稱後再加入。</p>
        <div v-if="editing === 'logout'" class="dialog-actions">
          <button type="button" class="btn btn-secondary" @click="dialog.close()">取消</button>
          <button type="submit" class="btn btn-primary">確認登出</button>
        </div>
        <div v-else class="dialog-actions"><button type="button" class="btn btn-secondary duplicate-space-return" @click="dialog.close()">返回</button></div>
      </form>
    </dialog>
  </section>
</template>

<style scoped lang="scss">
@use 'sass:color';
@use '../assets/scss/tokens' as t;
@use '../assets/scss/profile-avatar' as avatar;
@use '../assets/scss/page-header' as header;

.settings-page.restoring-view { visibility: hidden; }
.settings-page {
  width: 100%;
  max-width: 358px;
  padding-top: t.$space-16;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  text-align: left;
  color: t.$text-main;
  font-family: t.$font-family;
}

.settings-header {
  @include header.page-header(0);
  h1 { @include header.page-title; }
}

.profile {
  min-height: 175px;
  padding-block: 11px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.avatar-holder {
  position: relative;
  width: 140px;
  height: 104px;
}

.uploaded-profile-avatar {
  position: absolute;
  left: 18px;
  width: 104px;
  height: 104px;
  object-fit: cover;
  @include avatar.background;
  border-radius: 50%;
  box-shadow: t.$shadow-raised;
}

.edit-profile-link {
  display: inline-block;
  margin-top: t.$space-8;
  color: t.$primary-green;
  font: t.$font-weight-medium #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family;
  text-decoration: none;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: t.$space-4; }
}

.profile-info {
  padding-top: 15px;
  text-align: center;
}

.profile-name { margin: 0; font-size: 16px; font-weight: 500; line-height: 22px; }
.profile-email { margin: 0; font-size: t.$font-size-metadata; color: t.$text-sub; line-height: 18px; }

.settings-section + .settings-section { margin-top: 15px; }

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 18px;

  h2 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: #292624;
    font: 700 16px / 22px t.$font-family;
    letter-spacing: 0;

    img { width: 20px; height: 20px; }
  }
}

.settings-card {
  overflow: hidden;
  border: 1px solid rgba(237, 234, 227, .4);
  border-radius: t.$radius-card;
  background: t.$card-bg;
  box-shadow: t.$shadow-card;
}
.settings-card-pill { border-radius: t.$radius-pill; }

.settings-row > .settings-space-dot:first-child, .settings-row > .settings-space-dot { flex: 0 0 t.$space-12 !important; min-width: t.$space-12; max-width: t.$space-12; width: t.$space-12; height: t.$space-12; border-radius: t.$radius-pill; margin-right: t.$space-8; }
.sortable-spaces > .settings-row { min-height: auto; padding-block: 0; margin-block: t.$space-20; &::after { display: none; } }

.spaces-drawer .sortable-spaces { transform: translateY(-100%); transition: transform .5s ease; }
.spaces-drawer.expanded .sortable-spaces { transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .spaces-drawer .sortable-spaces { transition: none; } }
.settings-space-group { padding-bottom: 6px; }
.settings-space-group + .settings-space-group { position: relative; &::before { content: ''; position: absolute; top: 0; left: t.$space-16; right: t.$space-16; height: 1px; background: t.$border-color; } }
.settings-space-group:last-of-type .sortable-spaces > .settings-row:last-child { margin-bottom: t.$space-8; }
.settings-space-group .sortable-spaces > .settings-row:first-child { margin-top: 0; }
.settings-space-group .spaces-drawer.expanded .reminder-collapse-content { padding-top: 0; }
.collapsed-space-count { margin-left: t.$space-8; color: t.$text-sub; font-size: t.$font-size-caption; }
.space-group-heading > span:last-child { display: grid; place-items: center; flex: 0 0 16px; width: 16px; color: t.$text-sub; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; }
.space-group-heading { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: t.$space-16 t.$space-16 10px; border: 0; background: transparent; color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family; }
.settings-add-space { margin: 0 t.$space-16; padding-top: t.$space-8; padding-bottom: t.$space-16; }
.add-space-link { display: flex; justify-content: center; align-items: center; min-height: t.$button-height; border-radius: t.$radius-pill; background: #ecf4ea; color: #3c763c; text-decoration: none; font: t.$font-weight-bold #{t.$font-size-button} / 22px t.$font-family; }
.spaces-list-toggle { width: 100%; display: flex; align-items: center; justify-content: center; gap: t.$space-8; margin-bottom: t.$space-12; padding: t.$space-8; border: 0; background: transparent; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-caption} / #{t.$line-height-body} t.$font-family; }
.settings-row > .settings-space-name { flex: 1; min-width: 0; }
.settings-member-count { margin-right: t.$space-8; color: t.$text-body; white-space: nowrap; }
.settings-join-space { margin: 0 t.$space-16; padding-top: t.$space-16; padding-bottom: t.$space-24; color: t.$text-body; font-size: t.$font-size-body-sm; label { display: block; margin-bottom: t.$space-12; } }
.settings-join-controls { display: flex; align-items: flex-start; gap: t.$space-8;
  input { box-sizing: border-box; min-width: 0; flex: 1; height: t.$button-height; padding: t.$space-4 14px; border: 0; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: t.$font-weight-regular #{t.$font-size-body-sm} / 20px t.$font-family; &::placeholder { color: t.$text-disabled; } &:focus { outline: 2px solid t.$primary-green; outline-offset: 2px; } }
  .btn { flex: 0 0 64px; height: 36px; min-height: 36px; margin-top: 6px; padding: 0; border: 0; border-radius: t.$radius-pill; background: t.$primary-green; color: t.$text-inverse; font: t.$font-weight-bold #{t.$font-size-body-sm} / 20px t.$font-family; box-shadow: t.$shadow-primary; &:disabled { background: #e0e0e0; color: #a6a6a6; box-shadow: none; opacity: 1; cursor: default; } }
}
.item-management-link { cursor: pointer; }
.space-group-heading, .settings-join-space > label, .settings-row.item-management-link {
  color: t.$text-body;
  font: t.$font-weight-regular #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family;
}
.settings-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 48px;
  position: relative;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  text-align: left;
  color: t.$text-body;
  text-decoration: none;
  font: 400 14px / 20px t.$font-family;

  > span:first-child { flex: 1; }
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    left: t.$space-16;
    right: t.$space-16;
    bottom: 0;
    height: 1px;
    background: t.$border-color;
  }
}

.row-value { color: t.$text-main; font-weight: 500; white-space: nowrap; &.notification-muted { color: t.$text-disabled; } }
.chevron { width: 16px; height: 16px; }
.notification-switch {
  width: t.$switch-width;
  height: t.$switch-height;
  padding: 0;
  border: 0;
  background: transparent;
  flex-shrink: 0;
  border-radius: t.$radius-pill;
}

.logout-button {
  margin-top: 12px;
  width: 100%;
  min-height: t.$button-height;
  font-family: t.$font-family;
  font-size: t.$font-size-button;
  font-weight: t.$font-weight-bold;
}

.settings-notice { color: t.$text-sub; font-size: t.$font-size-metadata; margin: 0; }
button { cursor: pointer; }
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -3px; }
.settings-dialog {
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
.settings-dialog.duplicate-space-dialog {
  width: min(300px, calc(100% - t.$space-16 * 2));
  max-height: calc(100dvh - t.$space-24 * 2);
  margin: auto;
  padding: t.$space-24 18px;
  text-align: center;
  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold #{t.$font-size-card-title} / 1.45 t.$font-family; overflow-wrap: anywhere; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-body} / 1.45 t.$font-family; overflow-wrap: anywhere; }
  .duplicate-space-return { background: t.$input-bg; color: t.$text-button-secondary; border: 0; box-shadow: t.$shadow-raised; &:focus, &:focus-visible { outline: none; } }
  .dialog-actions { margin-top: t.$space-32; }
  .btn { width: 100%; height: t.$button-height; padding: 0 t.$space-24; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body} / normal t.$font-family; }
}
.settings-dialog .btn-secondary:focus, .settings-dialog .btn-secondary:focus-visible { outline: none; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

.notification-section { position: relative; > .settings-row { padding-bottom: t.$space-4; } &::after { content: ''; position: absolute; bottom: 0; left: t.$space-16; right: t.$space-16; height: 1px; background: t.$border-color; } > .settings-row::after { display: none; } }
.notification-hint-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s ease; &.expanded { grid-template-rows: 1fr; } }
.notification-hint-inner { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .notification-hint-collapse { transition: none; } }
.phone-notification-hint { margin: 0; padding: 0 t.$space-16 t.$space-12; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.notice-action { margin-left: auto; flex-shrink: 0; border: 0; background: transparent; color: t.$toast-success-accent; font: inherit; }
@media (prefers-reduced-motion: reduce) { .profile-toast-enter-active, .profile-toast-leave-active { transition: none; } }
.reminder-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s ease; &.expanded { grid-template-rows: 1fr; } }
.reminder-collapse-content { min-height: 0; overflow: hidden; }
.reminder-expand { margin: 0 t.$space-16; padding-top: t.$space-4; padding-bottom: t.$space-12; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid t.$border-color; }
.reminder-options { padding: 6px; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.reminder-option { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 40px; padding: 0 12px; border: 1px solid transparent; border-radius: 14px; background: transparent; color: t.$text-main; font: 400 14px / 20px t.$font-family; text-align: left; img { display: block; } &.selected { border-color: t.$primary-green; background: t.$active-green; color: t.$primary-green; font-weight: 500; box-shadow: t.$shadow-inset; } }
.custom-reminder {
  display: flex; flex-direction: column; gap: t.$space-8; padding: t.$space-12 t.$space-16;
  border: 1.5px solid t.$primary-green; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset;
  color: t.$text-body; font: t.$font-weight-regular #{t.$font-size-body-sm} / #{t.$line-height-body} t.$font-family;
  label { display: flex; align-items: center; gap: t.$space-4; }
  .required { color: t.$accent-text; }
  .custom-days-value { margin-left: auto; color: t.$text-sub; }
  input[type='range'] {
    appearance: none; width: 100%; height: t.$space-24; margin: t.$space-8 0; background: transparent; cursor: pointer;
    &::-webkit-slider-runnable-track { height: t.$space-8; border-radius: t.$radius-pill; background: linear-gradient(to right, t.$primary-green 0 var(--range-progress), t.$primary-subtle var(--range-progress) 100%); }
    &::-moz-range-track { height: t.$space-8; border-radius: t.$radius-pill; background: t.$primary-subtle; }
    &::-moz-range-progress { height: t.$space-8; border-radius: t.$radius-pill; background: t.$primary-green; }
    &::-webkit-slider-thumb { appearance: none; width: t.$space-24; height: t.$space-12; margin-top: calc((t.$space-8 - t.$space-12) / 2); border: 0; border-radius: t.$space-4; background: t.$primary-green; box-shadow: none; }
    &::-moz-range-thumb { box-sizing: border-box; width: t.$space-24; height: t.$space-12; border: 0; border-radius: t.$space-4; background: t.$primary-green; box-shadow: none; }
  }
}
.range-limits { display: flex; justify-content: space-between; color: t.$text-sub; font-size: t.$font-size-caption; }
.custom-days-error { margin: 0; color: t.$danger; font-size: t.$font-size-caption; }

@media (prefers-reduced-motion: reduce) { .reminder-collapse { transition: none; } }
.settings-row[data-reminder-control]::after { display: none; }
.settings-row[data-reminder-control]:not(.last-reminder-row)[aria-expanded="false"]::after { display: block; right: t.$space-16; }
.reminder-expand.last-reminder-expand { border-bottom: 0; }
.settings-dialog .dialog-actions { display: flex; gap: t.$space-12; margin-top: t.$space-32; }
.settings-dialog .dialog-actions .btn { flex: 1; min-width: 0; height: t.$button-height; min-height: t.$button-height; padding: 0 t.$space-24; border: 0; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body} / normal t.$font-family; }
.settings-dialog .dialog-actions .btn-secondary { background: t.$input-bg; color: t.$text-button-secondary; box-shadow: t.$shadow-raised; }
.settings-dialog .dialog-actions button:focus { outline: none; }
.settings-dialog .dialog-actions button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.custom-days-error {
  margin-block: t.$space-12;
  box-sizing: border-box;
  padding: t.$space-8 t.$space-12;
  border-radius: t.$radius-md;
  background: t.$accent-soft;
  color: t.$accent-text;
  font: t.$font-weight-regular #{t.$font-size-metadata} / normal t.$font-family;
  text-align: left;
}
.settings-dialog .dialog-actions .btn-secondary:focus, .settings-dialog .dialog-actions .btn-secondary:focus-visible { outline: none; }
.notice-icon { width: 22px; flex-shrink: 0; font-size: 22px; color: t.$toast-success-accent; }
</style>
