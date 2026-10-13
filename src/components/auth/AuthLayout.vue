<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import BackButton from './BackButton.vue'
defineProps({ showBack: Boolean, showIllustrationOptions: Boolean, centerHero: Boolean })
defineEmits(['back'])
const layout = ref(null)
const keyboardOpen = ref(false)
const keyboardInset = ref(0)
let fullHeight = 0
let frame
function updateViewport() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const viewport = window.visualViewport
    const focused = document.activeElement
    const editing = layout.value?.contains(focused) && focused?.matches('input:not([type="file"]), textarea')
    if (!editing) fullHeight = window.innerHeight
    // 放大畫面不視為鍵盤；同時支援覆蓋內容與縮小 WebView 的鍵盤模式。
    const visibleHeight = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight
    keyboardOpen.value = !!editing && fullHeight - visibleHeight > 100
    keyboardInset.value = keyboardOpen.value ? Math.max(0, window.innerHeight - visibleHeight - (viewport?.offsetTop || 0)) : 0
    if (editing && keyboardOpen.value) focused.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  })
}
onMounted(() => {
  fullHeight = window.innerHeight
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.addEventListener('resize', updateViewport)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.removeEventListener('resize', updateViewport)
})
</script>
<template>
  <section ref="layout" class="auth-layout" :class="{ 'keyboard-open': keyboardOpen }" :style="{ '--keyboard-inset': `${keyboardInset}px` }" aria-label="登入與帳號設定" @focusin="updateViewport" @focusout="updateViewport">
    <BackButton v-if="showBack" @click="$emit('back')" />
    <div class="auth-hero" :class="{ 'auth-hero--centered': centerHero }">
    <div class="auth-illustration-area">
      <div class="auth-illustration"><slot name="illustration" /></div>
      <div v-if="showIllustrationOptions" class="auth-illustration-options"><slot name="illustration-options" /></div>
    </div>
    <header class="auth-heading"><h1><slot name="title" /></h1><p><slot name="subtitle" /></p></header>
    </div>
    <slot />
  </section>
</template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
@use '../../assets/scss/page-header' as header;
.auth-layout { position: relative; display: flex; flex-direction: column; width: 100%; max-width: 345px; min-height: calc(100dvh - 34px); margin-inline: auto; padding: 96px 0 24px; box-sizing: border-box; color: t.$text-main; font-family: t.$font-family; }
.auth-layout { padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px)); }
.auth-layout.keyboard-open { padding-top: 96px; }
.auth-layout :deep(input) { scroll-margin-block: 24px; }
.auth-hero--centered { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-block: t.$space-24; }
.auth-illustration-area { display: flex; flex-direction: column; align-items: center; gap: 34px; margin-bottom: t.$space-24; }
.auth-illustration { width: 104px; height: 104px; display: grid; place-items: center; flex-shrink: 0; }
.auth-illustration-options { display: flex; align-items: center; justify-content: center; }
.auth-heading { display: flex; flex-direction: column; gap: t.$space-8; margin-bottom: t.$space-24; text-align: center; h1 { @include header.page-title; line-height: 32px; } p { margin: 0; color: t.$text-sub; font-size: t.$font-size-body; line-height: 22px; overflow-wrap: anywhere; } }
</style>
