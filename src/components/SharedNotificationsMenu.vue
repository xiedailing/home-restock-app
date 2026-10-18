<script setup>
import { useRouter } from 'vue-router'
import { useSharedNotificationsStore } from '../stores/sharedNotifications'
import bell from '../assets/login/bell.svg'
const router = useRouter()
const store = useSharedNotificationsStore()
</script>
<template>
  <div class="shared-notifications">
    <button type="button" class="bell-trigger" :aria-label="store.hasUnseen ? '通知，有新通知' : '通知'" @click="router.push({ name: 'notifications' })"><img :src="bell" alt="" /><span v-if="store.hasUnseen" class="unread-dot trigger-dot" aria-hidden="true"></span></button>
  </div>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/profile-avatar' as avatar;
.shared-notifications { position: relative; flex-shrink: 0; }
.bell-trigger { position: relative; width: 45px; height: 45px; padding: 0; border: 0; border-radius: t.$radius-pill; @include avatar.background; box-shadow: t.$shadow-raised; display: grid; place-items: center; cursor: pointer; img { width: 25px; height: 25px; object-fit: contain; } }
.unread-dot { display: inline-block; width: 7px; height: 7px; flex: 0 0 7px; border-radius: t.$radius-pill; background: t.$primary-green; }
.trigger-dot { position: absolute; top: 1px; right: 1px; border: 2px solid t.$card-bg; width: 10px; height: 10px; }
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
