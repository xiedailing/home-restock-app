<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import closeIcon from '../assets/settings/invite-close.svg'
const props = defineProps({ open: Boolean, space: Object })
const emit = defineEmits(['close', 'copied'])
const dialog = ref(null)
const offset = ref(0)
const closing = ref(false)
const closeDuration = ref(500)
let closeTimer
const copyNotice = ref('')
const copiedField = ref('')
let copyTimer
function copied(message) {
  copyNotice.value = message
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyNotice.value = ''; copiedField.value = '' }, 3000)
}
let startY = null
const code = computed(() => 'ABC-0000')
const link = computed(() => {
  const url = new URL(window.location.href)
  url.pathname = '/settings/spaces'
  url.search = ''
  url.searchParams.set('invite', code.value)
  return url.href
})
watch(() => props.open, async open => {
  await nextTick()
  if (open) { clearTimeout(closeTimer); closing.value = false; offset.value = 0; copyNotice.value = ''; copiedField.value = ''; dialog.value?.showModal() }
  else dialog.value?.close()
})
function close(duration = 500) {
  if (closing.value) return
  closeDuration.value = typeof duration === 'number' ? duration : 500
  closing.value = true
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : closeDuration.value
  closeTimer = setTimeout(() => emit('close'), delay)
}
function startDrag(event) {
  if (event.button !== 0) return
  startY = event.clientY
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDrag(event) {
  if (startY !== null) offset.value = Math.max(0, event.clientY - startY)
}
function endDrag() {
  if (offset.value > 80) close()
  offset.value = 0
  startY = null
}
async function copy(value, label) {
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = label
    copied(`${label}已複製`)
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    dialog.value.append(input)
    input.select()
    const success = document.execCommand('copy')
    input.remove()
    if (success) copiedField.value = label
    copied(success ? `${label}已複製` : '無法複製，請手動複製邀請資訊')
  }
}
onBeforeUnmount(() => { clearTimeout(copyTimer); clearTimeout(closeTimer); dialog.value?.close() })
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="invite-sheet" :class="{ closing }" :style="{ '--drag-offset': `${offset}px`, '--close-duration': `${closeDuration}ms` }" aria-labelledby="invite-sheet-title" @cancel.prevent="close" @click="($event.target === dialog) && close()">
      <div class="sheet-grab-area" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag"><span class="sheet-handle" /></div>
      <header><h2 id="invite-sheet-title">邀請成員</h2><button type="button" class="sheet-close" aria-label="關閉邀請成員" @click="close"><img :src="closeIcon" alt="" /></button></header>
      <p class="sheet-description">將邀請碼或連結提供給成員，即可加入「{{ space?.name }}」。</p>
      <div class="invite-field"><div><span>邀請碼</span><p>{{ code }}</p></div><button type="button" :class="{ copied: copiedField === '邀請碼' }" class="copy-button" @click="copy(code, '邀請碼')">複製</button></div>
      <div class="invite-field"><div><span>邀請網址</span><p :title="link">{{ link }}</p></div><button type="button" :class="{ copied: copiedField === '邀請網址' }" class="copy-button" @click="copy(link, '邀請網址')">複製</button></div>
      <p class="invite-helper">只有取得邀請資訊的人能申請加入此空間。</p>
      <Transition name="copy-toast"><p v-if="copyNotice" class="copy-notice" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>{{ copyNotice }}</span></p></Transition>
      <button type="button" class="btn btn-primary sheet-done" @click="close(500)">完成</button>
    </dialog>
  </Teleport>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.invite-sheet { position: fixed; inset: auto 0 0; margin: 0 auto; width: 100%; max-width: 390px; max-height: 90dvh; padding: 0 20px max(34px, env(safe-area-inset-bottom)); border: 0; border-radius: 28px 28px 0 0; background: #fbfaf6; color: t.$text-main; font-family: t.$font-family; box-shadow: 0 -8px 24px rgba(77,71,61,.22); transform: translateY(var(--drag-offset)); &::backdrop { background: rgba(0,0,0,.35); } &[open] { animation: sheet-enter .5s ease; } header { display: flex; align-items: center; justify-content: space-between; min-height: 32px; } h2 { margin: 0; font-size: 20px; font-weight: 700; } }
.invite-sheet.closing { animation: sheet-exit var(--close-duration) ease forwards; }
@keyframes sheet-exit { from { transform: translateY(var(--drag-offset)); } to { transform: translateY(100%); } }
.sheet-grab-area { height: 30px; display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; }
.sheet-handle { width: 36px; height: 4px; border-radius: t.$radius-pill; background: t.$border-color; }
.sheet-close { width: 32px; height: 32px; border: 0; background: transparent; display: grid; place-items: center; img { width: 20px; height: 20px; } }
.sheet-description { margin: 12px 0; color: #8b8880; font-size: 12px; }
.invite-field { display: flex; align-items: center; gap: 12px; min-height: 72px; margin-bottom: 12px; padding: 10px 16px; border-radius: 16px; box-shadow: t.$shadow-inset; > div { min-width: 0; flex: 1; } span { color: #8b8880; font-size: 12px; } p { margin: 6px 0 0; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.copy-button { flex: 0 0 64px; height: 32px; border: 0; border-radius: t.$radius-pill; background: #ecf3ea; color: t.$primary-green; font-size: 12px; box-shadow: t.$shadow-raised; }
.copy-button { transition: box-shadow .5s ease, background-color .5s ease; &:active, &.copied { background: #eef3ea; box-shadow: inset -1.5px -1.5px 4px rgba(255,255,255,.85), inset 1.5px 2px 5px rgba(138,158,136,.32); } }
.invite-helper { padding: 11px 16px; margin: 0 0 12px; background: rgba(236,243,234,.75); border-radius: 14px; color: #8b8880; font-size: 12px; }
.copy-notice {
  position: fixed;
  bottom: t.$toast-bottom;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  width: max-content;
  max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2));
  min-height: t.$toast-min-height;
  margin: 0;
  padding: t.$toast-padding-block t.$toast-padding-inline;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$toast-background;
  color: t.$toast-text;
  box-shadow: t.$toast-shadow;
  font-family: t.$font-family;
  font-weight: t.$font-weight-bold;
  font-size: t.$font-size-body-sm;
  line-height: t.$line-height-body;
  text-align: center;
  pointer-events: none;
  i { color: t.$toast-success-accent; flex-shrink: 0; }
}
.copy-toast-leave-active { transition: opacity .5s ease; }
.copy-toast-leave-to { opacity: 0; }
.sheet-done { width: 100%; min-height: 48px; border-radius: 16px; font-size: 15px; }
button { cursor: pointer; }
@keyframes sheet-enter { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .invite-sheet[open], .invite-sheet.closing { animation: none; } }
</style>
