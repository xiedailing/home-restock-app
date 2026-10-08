<script setup>
import { computed, ref } from 'vue'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import editIcon from '../assets/settings/edit.svg'
import reminderIcon from '../assets/settings/reminder.svg'
import spacesIcon from '../assets/settings/spaces.svg'
import categoriesIcon from '../assets/settings/categories.svg'
import chevron from '../assets/settings/chevron.svg'
import switchOn from '../assets/settings/switch-on.svg'

// 先使用畫面範例資料，之後可改由帳號／設定 store 提供。
const emit = defineEmits(['open-categories', 'logout'])
const notifications = ref(true)
const restockDays = ref(5)
const shoppingDays = ref(5)
const dialog = ref(null)
const editing = ref('')
const draftDays = ref(5)
const notice = ref('')
const dialogTitle = computed(() => ({ restock: '補貨建議', shopping: '購買清單提醒', logout: '確認登出' }[editing.value]))

function openEditor(type) {
  editing.value = type
  draftDays.value = type === 'shopping' ? shoppingDays.value : restockDays.value
  dialog.value.showModal()
}

function saveChanges() {
  if (editing.value === 'restock') {
    restockDays.value = Number(draftDays.value)
  } else if (editing.value === 'shopping') {
    shoppingDays.value = Number(draftDays.value)
  } else if (editing.value === 'logout') {
    emit('logout')
    notice.value = '登出功能尚未串接登入服務。'
  }
  dialog.value.close()
}

function openManagement(type) {
  emit('open-categories')
  notice.value = '分類管理頁面尚未建立。'
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
            <img v-if="notifications" :src="switchOn" alt="" />
            <span v-else class="switch-off" aria-hidden="true"><span /></span>
          </button>
        </div>
        <button type="button" class="settings-row" @click="openEditor('restock')">
          <span>補貨建議</span>
          <span class="row-value">提前 {{ restockDays }} 天</span>
          <img class="chevron" :src="chevron" alt="" />
        </button>
        <button type="button" class="settings-row" @click="openEditor('shopping')">
          <span>購買清單提醒</span>
          <span class="row-value">提前 {{ shoppingDays }} 天</span>
          <img class="chevron" :src="chevron" alt="" />
        </button>
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
        <button type="button" class="settings-row" @click="openManagement('categories')">
          <span>查看分類</span><img class="chevron" :src="chevron" alt="" />
        </button>
      </div>
    </section>

    <button type="button" class="btn btn-danger-flat logout-button" @click="openEditor('logout')">登出</button>
    <p v-if="notice" class="settings-notice" role="status">{{ notice }}</p>

    <dialog ref="dialog" class="settings-dialog" aria-labelledby="settings-dialog-title">
      <form @submit.prevent="saveChanges">
        <h2 id="settings-dialog-title">{{ dialogTitle }}</h2>
        <template v-if="editing === 'restock' || editing === 'shopping'">
          <label for="reminder-days">提前天數</label>
          <select id="reminder-days" v-model="draftDays" class="form-select">
            <option v-for="days in [1, 3, 5, 7, 14, 30]" :key="days" :value="days">提前 {{ days }} 天</option>
          </select>
        </template>
        <p v-else>確定要登出嗎？</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" @click="dialog.close()">取消</button>
          <button type="submit" class="btn btn-primary">{{ editing === 'logout' ? '確認登出' : '儲存' }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
// 頁面靜止時保留卡片陰影，切頁動畫期間沿用 App 的裁切。
:global(.app-container .app-content:has(.settings-page):not(:has(.page-forward-enter-active, .page-forward-leave-active, .page-back-enter-active, .page-back-leave-active))) { overflow: visible; }

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
    font: 700 17px / 24px t.$font-family;
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
.profile-email { margin: 0; font-size: 13px; color: t.$text-sub; line-height: 18px; }

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
  border-radius: 20px;
  background: #fbfaf6;
  box-shadow: t.$shadow-card;
}
.settings-card-pill { border-radius: t.$radius-pill; }

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
    left: 16px;
    right: 0;
    bottom: 0;
    height: 1px;
    background: t.$border-color;
  }
}

.row-value { color: t.$text-main; font-weight: 500; white-space: nowrap; }
.chevron { width: 16px; height: 16px; }
.notification-switch {
  width: 52px;
  height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  flex-shrink: 0;
  border-radius: t.$radius-pill;
  img { display: block; width: 52px; height: 32px; }
}
.switch-off {
  display: flex;
  align-items: center;
  width: 52px;
  height: 32px;
  padding: 3px;
  border-radius: t.$radius-pill;
  background: t.$border-color;
  box-shadow: t.$shadow-inset;
  span { width: 26px; height: 26px; border-radius: 50%; background: t.$surface-bg; }
}

.logout-button {
  margin-top: 12px;
  width: 100%;
  min-height: 48px;
  background: #fbede9;
  color: #c83b2b;
  font-size: 14px;
  font-weight: 700;
  box-shadow: none;
}
.settings-notice { color: t.$text-sub; font-size: 13px; margin: 0; }
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
</style>
