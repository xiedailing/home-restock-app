<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'

const props = defineProps({ to: { type: [String, Object], required: true } })
const route = useRoute()
const router = useRouter()
const profileTarget = computed(() => typeof props.to === 'object'
  ? { ...props.to, query: { ...props.to.query, returnTo: route.fullPath } }
  : { path: props.to, query: { returnTo: route.fullPath } })
const open = ref(false)
const root = ref(null)
const trigger = ref(null)
const menu = ref(null)
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menu.value?.querySelector('button')?.focus({ preventScroll: true })
  }
}
function dismiss(event) {
  if (!root.value?.contains(event.target)) open.value = false
}
function onKeydown(event) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    trigger.value?.focus({ preventScroll: true })
  }
}
async function openProfile() {
  await router.push(profileTarget.value)
  open.value = false
}
onMounted(() => document.addEventListener('pointerdown', dismiss))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismiss))
</script>

<template>
  <div ref="root" class="profile-avatar-menu" @keydown="onKeydown">
    <button ref="trigger" class="avatar-trigger" type="button" aria-label="帳號資訊" :aria-expanded="open" @click="toggle">
      <img :src="profile.avatar || defaultAvatar" alt="" />
    </button>
    <div v-if="open" ref="menu" class="account-panel" aria-label="帳號資訊">
      <p class="account-name">{{ profile.name }}</p>
      <p class="account-email">{{ profile.email }}</p>
      <button type="button" class="profile-link" @click="openProfile">個人檔案設定</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/profile-avatar' as avatar;
.profile-avatar-menu { position: relative; flex-shrink: 0; }
.avatar-trigger {
  display: flex; padding: 0; border: 0; border-radius: t.$radius-pill; @include avatar.background; cursor: pointer;
  img { width: 45px; height: 45px; border-radius: inherit; object-fit: cover; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; }
}
.account-panel {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 20;
  width: 250px; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 20px; border: 1px solid t.$border-color; border-radius: t.$radius-popover;
  background: t.$card-bg; box-shadow: none;
  p { margin: 0; overflow-wrap: anywhere; }
}
.account-name { color: t.$text-main; font-size: t.$font-size-body; font-weight: t.$font-weight-bold; }
.account-email { margin-top: 5px !important; color: t.$text-sub; font-size: t.$font-size-body-sm; }
.profile-link {
  display: block; width: 100%; margin-top: 16px; padding: 12px; border-radius: t.$radius-pill; cursor: pointer; font-family: inherit;
  background: t.$primary-subtle; color: t.$primary-green; text-align: center;
  text-decoration: none; font-size: t.$font-size-body-sm; font-weight: t.$font-weight-bold;
  border: 0; box-shadow: none;
  &:hover, &:focus, &:focus-visible, &:active { outline: none; text-decoration: none; }
}
</style>
