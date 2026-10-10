<script setup>
import { computed, ref, shallowRef, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { limitSpaceName } from '../models/space'
import { profile, updateProfile } from '../stores/profile'
import backIcon from '../assets/add-item/back-chevron.svg'
import { defaultAvatar, avatarOptions } from '../assets/household-icons-by-state/avatars/index.js'


const name = ref(profile.name)
const avatar = ref(profile.avatar)
const avatarMenuOpen = ref(false)
const cameraInput = ref(null)
const albumInput = ref(null)
function closeAvatarMenu(event) {
  if (!event.target.closest('.avatar-preview')) avatarMenuOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', closeAvatarMenu))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeAvatarMenu))
function openImagePicker(source) {
  avatarMenuOpen.value = false
  const input = source === 'camera' ? cameraInput.value : albumInput.value
  input?.click()
}
const error = ref('')
const avatarError = ref('')
const loadingImage = ref(false)
const editingName = ref(false)
const nameLimitExceeded = computed(() => limitSpaceName(name.value.trim()) !== name.value.trim())
const nameCount = computed(() => {
  const text = name.value
  const ascii = /^[\x00-\x7F]+$/.test(text)
  const count = Array.from(text).reduce((sum, char) => sum + (ascii || char.codePointAt(0) > 127 ? 1 : .5), 0)
  return `${Math.floor(count)}/${ascii ? 16 : 8}`
})
const nameInput = ref(null)
const notice = ref('')
let toastTimer
let enterCount = 0
function showNotice(message) {
  clearTimeout(toastTimer)
  notice.value = message
  toastTimer = setTimeout(() => { notice.value = '' }, 3000)
}
onBeforeUnmount(() => clearTimeout(toastTimer))
async function editName() {
  name.value = profile.name
  error.value = ''
  enterCount = 0
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}
function saveName(event) {
  if (!editingName.value || event?.isComposing) return
  if (event?.relatedTarget?.closest('.nickname-wrapper')) return
  if (nameLimitExceeded.value) return
  try {
    if (name.value.trim() && name.value.trim() !== profile.name) {
      updateProfile({ name: name.value, avatar: profile.avatar })
      showNotice('暱稱已更新')
    }
    editingName.value = false
  } catch (cause) { error.value = cause.message }
}
function handleEnter(event) {
  if (event.isComposing || event.keyCode === 229 || event.repeat) return
  if (++enterCount >= 2) saveName(event)
}
function clearName() { name.value = ''; enterCount = 0; nameInput.value?.focus() }
function chooseAvatar(value) {
  avatarMenuOpen.value = false
  avatarError.value = ''
  if (value === profile.avatar) return
  updateProfile({ name: profile.name, avatar: value })
  avatar.value = value
  showNotice('頭貼已更新')
}

const cropDialog = ref(null)
const cropSurface = ref(null)
const cropSource = ref('')
const cropZoom = ref(1)
const cropX = ref(0)
const cropY = ref(0)
const cropImage = shallowRef(null)
let cropDrag = null
const cropSize = 240
const cropBaseScale = computed(() => cropImage.value ? Math.max(cropSize / cropImage.value.naturalWidth, cropSize / cropImage.value.naturalHeight) : 1)
const cropWidth = computed(() => cropImage.value ? cropImage.value.naturalWidth * cropBaseScale.value * cropZoom.value : cropSize)
const cropHeight = computed(() => cropImage.value ? cropImage.value.naturalHeight * cropBaseScale.value * cropZoom.value : cropSize)
const cropStyle = computed(() => ({ width: `${cropWidth.value}px`, height: `${cropHeight.value}px`, transform: `translate(${(cropSize - cropWidth.value) / 2 + cropX.value}px, ${(cropSize - cropHeight.value) / 2 + cropY.value}px)` }))
function clampCrop() {
  const maxX = (cropWidth.value - cropSize) / 2
  const maxY = (cropHeight.value - cropSize) / 2
  cropX.value = Math.max(-maxX, Math.min(maxX, cropX.value))
  cropY.value = Math.max(-maxY, Math.min(maxY, cropY.value))
}
function startCropDrag(event) {
  if (event.button !== 0) return
  cropDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: cropX.value, startY: cropY.value }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveCrop(event) {
  if (!cropDrag || cropDrag.id !== event.pointerId) return
  cropX.value = cropDrag.startX + event.clientX - cropDrag.x
  cropY.value = cropDrag.startY + event.clientY - cropDrag.y
  clampCrop()
}
function endCrop(event) {
  if (cropDrag?.id !== event.pointerId) return
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  cropDrag = null
}
function moveCropByKey(event) {
  const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
  if (!delta) return
  event.preventDefault()
  cropX.value += delta[0]
  cropY.value += delta[1]
  clampCrop()
}
function cancelCrop() { cropDialog.value.close() }
function clearCrop() { cropSource.value = ''; cropImage.value = null; cropDrag = null }
function applyCrop() {
  if (!cropImage.value) return
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    const scale = cropBaseScale.value * cropZoom.value
    const sourceSize = cropSize / scale
    const sourceX = (cropImage.value.naturalWidth - sourceSize) / 2 - cropX.value / scale
    const sourceY = (cropImage.value.naturalHeight - sourceSize) / 2 - cropY.value / scale
    context.drawImage(cropImage.value, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512)
    chooseAvatar(canvas.toDataURL('image/png'))
    cropDialog.value.close()
  } catch { avatarError.value = '無法處理圖片，請重新選擇。' }
}

async function selectAvatar(event) {
  const file = event.target.files?.[0]
  if (!file) return
  avatarError.value = ''
  if (file.size > 5 * 1024 * 1024) {
    avatarError.value = '圖片大小不可超過 5 MB，請重新選擇。'
    event.target.value = ''
    return
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    avatarError.value = '請選擇 JPG、PNG 或 WebP 圖片。'
    event.target.value = ''
    return
  }
  loadingImage.value = true
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    // 確認檔案能被瀏覽器辨識為圖片，再更新預覽。
    const image = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = data
    })
    cropImage.value = image
    cropSource.value = data
    cropZoom.value = 1
    cropX.value = cropY.value = 0
    await nextTick()
    cropDialog.value.showModal()
    cropSurface.value?.focus()
  } catch {
    avatarError.value = '無法讀取圖片，請重新選擇。'
  } finally {
    loadingImage.value = false
    event.target.value = ''
  }
}

</script>

<template>
  <section class="edit-profile-page" aria-labelledby="edit-profile-title">
    <header class="page-header">
      <RouterLink :to="{ name: 'settings' }" class="back-link" aria-label="返回設定"><img :src="backIcon" alt="" /></RouterLink>
      <h1 id="edit-profile-title">個人檔案設定</h1>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <form @submit.prevent>
      <div class="avatar-card">
        <div class="avatar-preview">
          <img v-if="avatar" class="uploaded-avatar" :src="avatar" alt="頭像預覽" />
          <img v-else class="default-avatar" :src="defaultAvatar" alt="預設頭像" />
          <button type="button" class="avatar-upload" aria-label="更換頭貼" :aria-expanded="avatarMenuOpen" aria-controls="avatar-source-menu" :disabled="loadingImage" @click="avatarMenuOpen = !avatarMenuOpen" @keydown.esc="avatarMenuOpen = false">
            <i class="fa-regular fa-camera" aria-hidden="true"></i>
          </button>
          <input ref="cameraInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="user" tabindex="-1" aria-label="拍照上傳頭貼" @change="selectAvatar" />
          <input ref="albumInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-label="從相簿上傳頭貼" @change="selectAvatar" />
          <Transition name="avatar-menu">
            <div v-if="avatarMenuOpen" id="avatar-source-menu" class="avatar-source-menu" role="group" aria-label="頭貼來源" @keydown.esc.stop="avatarMenuOpen = false">
              <button type="button" @click="openImagePicker('camera')"><i class="fa-regular fa-camera" aria-hidden="true"></i>拍照</button>
              <button type="button" @click="openImagePicker('album')"><i class="fa-regular fa-image" aria-hidden="true"></i>從相簿選擇</button>
            </div>
          </Transition>
        </div>
        <p v-if="avatarError" class="avatar-error" role="alert">{{ avatarError }}</p>
        <div class="avatar-options" role="group" aria-label="選擇頭像">
          <button v-for="option in avatarOptions" :key="option.label" type="button" class="avatar-option" :class="{ selected: avatar === option.value }" :aria-label="option.label + '頭像'" :aria-pressed="avatar === option.value" :disabled="loadingImage" @click="chooseAvatar(option.value)">
            <img :src="option.image" alt=""  />
          </button>
        </div>
      </div>

      <div class="card profile-form">
        <div class="profile-row">
          <span class="field-label">登入帳號</span>
          <span class="account-value" aria-label="登入帳號，不可修改">{{ profile.email }}</span>
        </div>
        <div class="profile-row">
          <span class="field-label">暱稱</span>
          <div v-if="editingName" class="nickname-wrapper" @focusout="saveName">
            <input ref="nameInput" id="edit-profile-name" aria-label="暱稱" v-model="name" class="nickname-input" :class="{ 'limit-exceeded': nameLimitExceeded }" :aria-invalid="nameLimitExceeded" :aria-describedby="nameLimitExceeded ? 'nickname-length-error' : undefined" :placeholder="profile.name" autocomplete="nickname" @input="enterCount = 0" @keydown.enter.prevent="handleEnter" @keydown.esc.prevent="editingName = false" />
            <span class="nickname-count">{{ nameCount }}</span>
            <p v-if="nameLimitExceeded" id="nickname-length-error" class="nickname-length-error">名稱過長，請縮短。</p>
            <button type="button" class="clear-name" aria-label="清除暱稱" @mousedown.prevent @click="clearName"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i></button>
          </div>
          <div v-else class="nickname-value"><span>{{ profile.name }}</span><button type="button" class="edit-name" aria-label="修改暱稱" @click="editName"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></div>
        </div>
      </div>
      <p class="hint">共享成員會看到：{{ name.trim() || profile.name }} 認購</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    </form>
    <Teleport to="body">
      <dialog ref="cropDialog" class="avatar-crop-dialog" aria-labelledby="avatar-crop-title" aria-describedby="avatar-crop-hint" @close="clearCrop" @click="event => { if (event.target === cropDialog) cancelCrop() }">
        <h2 id="avatar-crop-title">調整頭貼</h2>
        <p id="avatar-crop-hint">拖曳照片調整位置，或使用方向鍵移動。</p>
        <div ref="cropSurface" class="avatar-crop-surface" tabindex="0" aria-label="頭貼裁切預覽" @pointerdown="startCropDrag" @pointermove="moveCrop" @pointerup="endCrop" @pointercancel="endCrop" @keydown="moveCropByKey">
          <img v-if="cropSource" :src="cropSource" :style="cropStyle" alt="" draggable="false" />
          <span class="avatar-crop-mask" aria-hidden="true"></span>
        </div>
        <label class="avatar-crop-zoom">縮放<input v-model.number="cropZoom" type="range" min="1" max="3" step="0.01" @input="clampCrop" /></label>
        <div class="avatar-crop-actions"><button type="button" class="btn btn-secondary" @click="cancelCrop">取消</button><button type="button" class="btn btn-primary" @click="applyCrop">確認</button></div>
      </dialog>
      <Transition name="profile-toast"><div v-if="notice" class="profile-toast" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>{{ notice }}</div></Transition></Teleport>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.edit-profile-page { max-width: 358px; min-height: calc(100svh - 34px); margin-inline: auto; padding-top: 16px; text-align: left; color: t.$text-main; font-family: t.$font-family; }
.page-header { display: flex; align-items: center; justify-content: space-between; min-height: 44px; margin-bottom: 16px; }
.page-header h1 { margin: 0; color: t.$text-main; font: t.$font-weight-bold #{t.$font-size-app-bar} / #{t.$line-height-app-bar} t.$font-family; letter-spacing: 0; }
.back-link { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: t.$radius-popover; background: t.$input-bg; box-shadow: t.$shadow-raised; color: t.$text-main; text-decoration: none; img { display: block; } }
.header-spacer { width: 44px; }
.avatar-card { display: flex; flex-direction: column; align-items: center; gap: 34px; padding: 32px 24px 28px; border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; }
.avatar-preview { position: relative; width: 104px; height: 104px; }
.default-avatar { width: 104px; height: 104px; border-radius: 50%; background: t.$active-green; box-shadow: t.$shadow-raised; }
.uploaded-avatar { width: 104px; height: 104px; object-fit: cover; border-radius: 50%; background: t.$active-green; box-shadow: t.$shadow-raised; }
.avatar-upload { position: absolute; right: -6px; bottom: -8px; display: grid; place-items: center; width: 34px; height: 34px; border: 2px solid #dce6d6; border-radius: 50%; background: t.$primary-green; box-shadow: t.$shadow-raised; color: white; font-size: 17px; cursor: pointer; }
.avatar-upload { box-sizing: border-box; padding: 0; }
.avatar-upload > i { display: grid; place-items: center; width: 20px; height: 20px; line-height: 1; }
.avatar-upload input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.avatar-options { display: flex; justify-content: center; gap: 16px; width: 100%; }
.avatar-option { position: relative; flex: 0 0 46px; height: 46px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: t.$active-green; cursor: pointer; }
.avatar-option img { display: block; width: 42px; height: 42px; border-radius: 50%; }
.avatar-option.selected { border-color: #196b3e; }
.avatar-upload:focus-within, .back-link:focus-visible, .avatar-option:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 4px; }
.profile-form { margin-top: 46px; padding: 0; border-radius: 20px; background: t.$card-bg; overflow: hidden; }
.profile-row { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 10px 16px; position: relative; }
.profile-row + .profile-row::before { content: ''; position: absolute; top: 0; left: 16px; right: 16px; height: 1px; background: t.$border-color; }
.field-label { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin: 0; font-size: t.$font-size-body-sm; color: t.$text-body; }
.field-label i { width: 16px; text-align: center; color: t.$text-sub; }
.account-value { margin-left: auto; min-width: 0; overflow-wrap: anywhere; text-align: right; color: t.$text-disabled; font-size: t.$font-size-body-sm; }
.nickname-input { box-sizing: border-box; width: 100%; min-width: 0; height: 36px; padding: 8px 76px 8px 12px; border: 0; border-radius: t.$radius-pill; color: t.$text-main; font: t.$font-weight-regular #{t.$font-size-body} / #{t.$line-height-body} t.$font-family; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.nickname-input::placeholder { color: t.$text-disabled; }
.hint { margin: 16px 0 0; font-size: t.$font-size-caption; line-height: 18px; color: t.$text-sub; }
.error-message { margin: 16px 0 0; color: t.$danger; font-size: t.$font-size-body-sm; }
.form-actions { display: flex; gap: 12px; margin-top: 24px; }
.form-actions .btn { flex: 1; font-size: 15px; }
@media (max-width: 360px) { .avatar-options { gap: 12px; } .profile-row { padding-inline: 12px; gap: 8px; } .account-value { font-size: t.$font-size-caption; } }
.nickname-wrapper { position: relative; margin-left: auto; width: 60%; min-width: 0; }
.nickname-value { margin-left: auto; display: flex; align-items: center; gap: t.$space-8; font-size: t.$font-size-body-sm; }
.edit-name, .clear-name { padding: 0; border: 0; background: transparent; color: t.$text-disabled; cursor: pointer; font-size: 16px; }
.clear-name { position: absolute; right: 12px; top: 18px; transform: translateY(-50%); }
.nickname-input:focus { outline: 2px solid t.$primary-green; outline-offset: 0; }

.profile-toast { box-sizing: border-box; position: fixed; bottom: t.$toast-bottom; left: 50%; transform: translateX(-50%); z-index: 1100; width: max-content; max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2)); min-height: t.$toast-min-height; padding: t.$toast-padding-block t.$toast-padding-inline; display: flex; align-items: center; gap: t.$space-8; border-radius: t.$radius-pill; background: t.$toast-background; color: t.$toast-text; box-shadow: t.$toast-shadow; font-family: t.$font-family; font-size: t.$font-size-body-sm; font-weight: t.$font-weight-bold; line-height: t.$line-height-body; i { color: t.$toast-success-accent; flex-shrink: 0; } }
.profile-toast-enter-active, .profile-toast-leave-active { transition: opacity .5s ease; }
.profile-toast-enter-from, .profile-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .profile-toast-enter-active, .profile-toast-leave-active { transition: none; } }
.nickname-count { position: absolute; right: 36px; top: 18px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; pointer-events: none; }
.nickname-input.limit-exceeded { outline: 2px solid t.$accent-text; }
.nickname-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.avatar-source-menu { position: absolute; left: -28px; top: 12px; z-index: 10; box-sizing: border-box; width: 176px; padding: 8px; border: 1px solid t.$border-color; border-radius: t.$radius-popover; background: t.$card-bg; box-shadow: t.$shadow-floating; button { display: flex; align-items: center; gap: 7px; width: 100%; height: 40px; padding: 0 12px; border: 0; background: transparent; color: t.$text-main; font: 500 14px / 20px t.$font-family; text-align: left; cursor: pointer; &:not(:last-child) { border-bottom: 1px solid t.$border-color; } &:focus-visible { outline: 2px solid t.$primary-green; border-radius: 14px; } } i { width: 20px; text-align: center; font-size: t.$font-size-card-title; } }
.avatar-menu-enter-active, .avatar-menu-leave-active { transition: opacity .5s ease; }
.avatar-menu-enter-from, .avatar-menu-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .avatar-menu-enter-active, .avatar-menu-leave-active { transition: none; } }
.avatar-error { margin: 0; color: t.$danger; font-size: t.$font-size-caption; line-height: 18px; text-align: center; }
.avatar-crop-dialog { box-sizing: border-box; width: min(320px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 24px; border: 0; border-radius: t.$radius-card; background: t.$card-bg; color: t.$text-main; font-family: t.$font-family; h2 { margin: 0; font-size: t.$font-size-card-title; text-align: center; } p { margin: 8px 0 16px; color: t.$text-sub; font-size: t.$font-size-caption; text-align: center; } &::backdrop { background: rgba(29,29,31,.5); } }
.avatar-crop-surface { position: relative; width: 240px; height: 240px; margin-inline: auto; overflow: hidden; background: t.$input-bg; touch-action: none; cursor: grab; user-select: none; &:active { cursor: grabbing; } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; } img { position: absolute; top: 0; left: 0; max-width: none; pointer-events: none; } }
.avatar-crop-mask { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 80px rgba(0,0,0,.45); pointer-events: none; }
.avatar-crop-zoom { display: flex; align-items: center; gap: 12px; margin-block: 16px; font-size: t.$font-size-body-sm; input { flex: 1; min-width: 0; accent-color: t.$primary-green; } }
.avatar-crop-actions { display: flex; gap: 12px; .btn { flex: 1; } .btn-secondary:focus { outline: none; } }
</style>
