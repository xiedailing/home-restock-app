<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import editIcon from '../assets/settings/edit.svg'
import reminderIcon from '../assets/settings/reminder.svg'
import spacesIcon from '../assets/settings/spaces.svg'
import categoriesIcon from '../assets/settings/categories.svg'
import chevron from '../assets/settings/chevron.svg'
import reminderChevronUp from '../assets/settings/reminder-chevron-up.svg'
import reminderCheck from '../assets/settings/reminder-check.svg'
import SwitchTrack from '../components/SwitchTrack.vue'

// 先使用畫面範例資料，之後可改由帳號／設定 store 提供。
const emit = defineEmits(['open-categories', 'logout'])
const notifications = ref(true)
const restockDays = ref(5)
const shoppingDays = ref(5)
const expandedReminder = ref('')
function closeReminderOutside(event) {
  if (!event.target.closest('[data-reminder-control]')) expandedReminder.value = ''
}
onMounted(() => document.addEventListener('pointerdown', closeReminderOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeReminderOutside))
const reminderModes = ref({ restock: '5', shopping: '5' })
const reminderOptions = [
  { value: '5', label: '提前5天' },
  { value: '7', label: '提前7天' },
  { value: 'custom', label: '自行設定' },
  { value: 'off', label: '不要提醒' },
]
const customDays = ref({ restock: '', shopping: '' })
function reminderSummary(type) {
  if (!notifications.value) return '不要提醒'
  const mode = reminderModes.value[type]
  if (mode === 'off') return '不要提醒'
  const days = mode === 'custom' ? Number(customDays.value[type]) : Number(mode)
  if (!Number.isSafeInteger(days) || days <= 0) return '自行設定'
  return `${type === 'shopping' ? '加入後' : '提前'} ${days} 天`
}
function chooseReminder(type, value) {
  reminderModes.value[type] = value
  if (reminderModes.value.restock === 'off' && reminderModes.value.shopping === 'off') {
    notifications.value = false
  } else if (value !== 'off') {
    notifications.value = true
  }
  if (value === '5' || value === '7') {
    if (type === 'restock') restockDays.value = Number(value)
    else shoppingDays.value = Number(value)
  }
}
function updateCustomDays(type, event) {
  const digits = event.target.value.replace(/[^0-9]/g, '')
  customDays.value[type] = digits
  event.target.value = digits
  const days = Number(digits)
  if (Number.isSafeInteger(days) && days > 0) {
    notifications.value = true
    if (type === 'restock') restockDays.value = days
    else shoppingDays.value = days
  }
}
const dialog = ref(null)
const editing = ref('')
const notice = ref('')
let toastTimer
function showNotice(message) { clearTimeout(toastTimer); notice.value = message; toastTimer = setTimeout(() => { notice.value = '' }, 3000) }
onBeforeUnmount(() => clearTimeout(toastTimer))
const dialogTitle = computed(() => editing.value === 'logout' ? '確認登出' : '')

function openEditor(type) {
  editing.value = type
  dialog.value.showModal()
}

function saveChanges() {
  if (editing.value === 'logout') {
    emit('logout')
    showNotice('登出功能尚未串接登入服務。')
  }
  dialog.value.close()
}

</script>

<template>
  <section class="settings-page" aria-labelledby="settings-title">
    <header class="settings-header">
      <h1 id="settings-title">設定</h1>
    </header>

    <div class="profile">
      <div class="avatar-holder">
        <img class="uploaded-profile-avatar" :src="profile.avatar || defaultAvatar" alt="個人頭像" />
        <RouterLink :to="{ name: 'edit-profile' }" class="edit-avatar" aria-label="編輯個人資料">
          <img :src="editIcon" alt="" />
        </RouterLink>
      </div>
      <div class="profile-info">
        <p class="profile-name">{{ profile.name }}</p>
        <p class="profile-email">{{ profile.email }}</p>
      </div>
    </div>

    <section class="settings-section" aria-labelledby="reminder-title">
      <h2 id="reminder-title"><img :src="reminderIcon" alt="" />提醒設定</h2>
      <div class="card settings-card">
        <div class="settings-row">
          <span>通知</span>
          <button type="button" class="notification-switch" role="switch" :aria-checked="notifications" aria-label="通知" @click="notifications = !notifications">
            <SwitchTrack :checked="notifications" />
          </button>
        </div>
        <template v-for="reminder in [{ type: 'restock', label: '補貨建議' }, { type: 'shopping', label: '購買清單提醒' }]" :key="reminder.type">
          <button type="button" class="settings-row" :class="{ 'last-reminder-row': reminder.type === 'shopping' }" data-reminder-control :aria-expanded="expandedReminder === reminder.type" :aria-controls="`reminder-options-${reminder.type}`" @click="expandedReminder = expandedReminder === reminder.type ? '' : reminder.type">
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
                <div v-if="reminderModes[reminder.type] === 'custom'" class="custom-reminder">
                  <label :for="`custom-days-${reminder.type}`">自訂天數</label>
                  <input :id="`custom-days-${reminder.type}`" :value="customDays[reminder.type]" inputmode="numeric" pattern="[0-9]*" placeholder="例如：3" :aria-invalid="!Number(customDays[reminder.type])" @input="updateCustomDays(reminder.type, $event)" @keydown.enter.prevent="$event.target.blur()" />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="spaces-title">
      <h2 id="spaces-title"><img :src="spacesIcon" alt="" />空間管理</h2>
      <div class="card settings-card settings-card-pill">
        <RouterLink :to="{ name: 'spaces' }" class="settings-row">
          <span>查看空間</span><img class="chevron" :src="chevron" alt="" />
        </RouterLink>
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
    <Teleport to="body"><Transition name="profile-toast"><div v-if="notice" class="profile-toast" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>{{ notice }}</div></Transition></Teleport>

    <dialog ref="dialog" class="settings-dialog" aria-labelledby="settings-dialog-title">
      <form @submit.prevent="saveChanges">
        <h2 id="settings-dialog-title">{{ dialogTitle }}</h2>
        <p>確定要登出嗎？</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" @click="dialog.close()">取消</button>
          <button type="submit" class="btn btn-primary">確認登出</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.settings-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  color: t.$text-main;
  font-family: t.$font-family;
}

.settings-header {
  min-height: 44px;
  display: flex;
  align-items: center;

  h1 {
    margin: 0;
    color: t.$text-main;
    font: t.$font-weight-bold #{t.$font-size-page-title} / #{t.$line-height-page-title} t.$font-family;
    letter-spacing: 0;
  }
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
  background: t.$active-green;
  border-radius: 50%;
  box-shadow: t.$shadow-raised;
}

.edit-avatar {
  position: absolute;
  left: 94px;
  top: 70px;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: t.$primary-green;
  display: grid;
  place-items: center;
  box-shadow: -2px -2px 5px rgba(255, 255, 255, .9), 3px 4px 7px rgba(42, 74, 39, .35), inset 1px 1.5px 2px rgba(31, 58, 29, .28);

  img { width: 20px; height: 20px; }
}

.profile-info {
  padding-top: 15px;
  text-align: center;
}

.profile-name { margin: 0; font-size: 16px; font-weight: 500; line-height: 22px; }
.profile-email { margin: 0; font-size: t.$font-size-metadata; color: t.$text-sub; line-height: 18px; }

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

.item-management-link { cursor: pointer; }
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
  width: min(358px, calc(100% - 32px));
  padding: 24px;
  border: 0;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  color: t.$text-main;
  box-shadow: t.$shadow-card;
  h2 { font: 700 18px / 24px t.$font-family; color: t.$text-main; margin: 0 0 20px; }
  label { display: block; margin-bottom: 8px; }
  &::backdrop { background: rgba(29, 29, 31, .35); }
}
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

.profile-toast { box-sizing: border-box; position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1100; width: max-content; max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2)); min-height: t.$toast-min-height; padding: t.$toast-padding-block t.$toast-padding-inline; display: flex; align-items: center; gap: t.$space-8; border-radius: t.$radius-pill; background: t.$toast-background; color: t.$toast-text; box-shadow: t.$toast-shadow; font-family: t.$font-family; font-size: t.$font-size-body-sm; font-weight: t.$font-weight-bold; line-height: t.$line-height-body; i { color: t.$toast-success-accent; flex-shrink: 0; } }
.profile-toast-enter-active, .profile-toast-leave-active { transition: opacity .5s ease; }
.profile-toast-enter-from, .profile-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .profile-toast-enter-active, .profile-toast-leave-active { transition: none; } }
.reminder-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .5s ease; &.expanded { grid-template-rows: 1fr; } }
.reminder-collapse-content { min-height: 0; overflow: hidden; }
.reminder-expand { margin: 0 t.$space-16; padding-top: t.$space-4; padding-bottom: t.$space-12; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid t.$border-color; }
.reminder-options { padding: 6px; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.reminder-option { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 40px; padding: 0 12px; border: 1px solid transparent; border-radius: 14px; background: transparent; color: t.$text-main; font: 400 14px / 20px t.$font-family; text-align: left; img { display: block; } &.selected { border-color: t.$primary-green; background: t.$active-green; color: t.$primary-green; font-weight: 500; box-shadow: t.$shadow-inset; } }
.custom-reminder { display: flex; flex-direction: column; gap: 6px; color: t.$text-body; font: 400 12px / 18px t.$font-family; input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 12px 16px; border: 1.5px solid t.$primary-green; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: 400 14px / 20px t.$font-family; &::placeholder { color: t.$text-disabled; } &:focus { outline: none; } } }
@media (prefers-reduced-motion: reduce) { .reminder-collapse { transition: none; } }
.settings-row[data-reminder-control]::after { display: none; }
.settings-row[data-reminder-control]:not(.last-reminder-row)[aria-expanded="false"]::after { display: block; right: t.$space-16; }
.reminder-expand.last-reminder-expand { border-bottom: 0; }
</style>
