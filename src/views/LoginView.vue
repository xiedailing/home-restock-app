<script setup>
import { computed, ref, nextTick, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { profile, completeDemoLogin } from '../stores/profile'
import { useNotificationSettingsStore } from '../stores/notificationSettings'
import { limitSpaceName } from '../models/space'
import { defaultAvatar, avatarOptions } from '../assets/household-icons-by-state/avatars'
import BottomSheet from '../components/BottomSheet.vue'
import logo from '../assets/logo.svg'
import backIcon from '../assets/add-item/back-chevron.svg'
import googleIcon from '../assets/login/google.svg'
import appleIcon from '../assets/login/apple.svg'
import notificationIcon from '../assets/login/notification.svg'
const router = useRouter()
const notificationSettings = useNotificationSettingsStore()
const step = ref('welcome')
const email = ref('')
const name = ref('')
const avatar = ref(profile.avatar)
const code = ref('')
const error = ref('')
const notice = ref('')
const avatarError = ref('')
const sheetOpen = ref(false)
const photoInput = ref(null)
const cameraInput = ref(null)
const loadingPhoto = ref(false)
const seconds = ref(0)
const otpInput = ref(null)
watch(step, async value => {
  if (value !== 'code') return
  await nextTick()
  if (step.value === 'code') otpInput.value?.focus({ preventScroll: true })
})
let timer
let reader
let active = true
const nameTooLong = computed(() => limitSpaceName(name.value.trim()) !== name.value.trim())
function go(next) { error.value = ''; notice.value = ''; step.value = next }
function back() {
  go({ email: 'welcome', code: 'email', profile: 'code', notifications: 'profile' }[step.value] || 'welcome')
}
function startCountdown() {
  clearInterval(timer)
  seconds.value = 60
  timer = setInterval(() => { if (--seconds.value <= 0) clearInterval(timer) }, 1000)
}
function sendCode() {
  if (!email.value.trim()) { error.value = '請輸入您的 Email。'; return }
  if (!/^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@[a-z]+\.com$/i.test(email.value.trim())) { error.value = '信箱格式錯誤，請重新輸入'; return }
  email.value = email.value.trim().toLowerCase()
  code.value = ''
  startCountdown()
  go('code')
}
function verifyCode() {
  if (code.value.length !== 6) { error.value = '請輸入完整的六位驗證碼。'; return }
  if (code.value !== '481529') { error.value = '驗證碼有誤，請重新輸入。'; return }
  go('profile')
}
function updateCode(event) {
  code.value = event.target.value.replace(/\D/g, '').slice(0, 6)
  event.target.value = code.value
  error.value = ''
}
function prepareProfile() {
  if (!name.value.trim()) { error.value = '請輸入您的使用者名稱。'; return }
  if (nameTooLong.value) { error.value = '名稱最多 8 個中文字或 16 個英文字元。'; return }
  go('notifications')
}
function finish(pushEnabled) {
  completeDemoLogin({ email: email.value, name: name.value, avatar: avatar.value })
  notificationSettings.setPushEnabled(pushEnabled)
  router.replace({ name: 'home' })
}
function selectPhoto(source) {
  sheetOpen.value = false
  ;(source === 'camera' ? cameraInput.value : photoInput.value)?.click()
}
function uploadPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  avatarError.value = ''
  if (file.size > 5 * 1024 * 1024) { avatarError.value = '圖片大小不可超過 5 MB，請重新選擇。'; return }
  if (!file.type.startsWith('image/')) { avatarError.value = '請選擇圖片檔案。'; return }
  reader?.abort()
  loadingPhoto.value = true
  reader = new FileReader()
  reader.onload = () => {
    const result = reader.result
    const image = new Image()
    image.onload = () => { if (active) { avatar.value = result; loadingPhoto.value = false } }
    image.onerror = () => { if (active) { avatarError.value = '無法讀取圖片，請重新選擇。'; loadingPhoto.value = false } }
    image.src = result
  }
  reader.onerror = () => { avatarError.value = '無法讀取圖片，請重新選擇。'; loadingPhoto.value = false }
  reader.readAsDataURL(file)
}
onBeforeUnmount(() => { active = false; clearInterval(timer); reader?.abort() })
</script>

<template>
  <section class="login-page" :class="`step-${step}`" aria-label="登入與帳號設定">
    <div v-if="['welcome', 'email', 'code'].includes(step)" class="login-brand">
      <button v-if="step === 'email'" type="button" class="email-demo-fill" aria-label="填入展示信箱" @click="email = 'bubu1028@gmail.com'; error = ''"><img :src="logo" alt="補補" /></button>
      <img v-else :src="logo" alt="補補" />
    </div>
    <template v-if="step === 'welcome'">
      <div class="welcome-hero">
        <h1>補補</h1><p>日常用品，補得剛剛好</p>
      </div>
      <div class="welcome-actions">
        <button class="btn btn-primary" @click="go('email')">使用 Email 帳號繼續</button>
        <div class="method-divider">或使用其他方式</div>
        <button class="btn btn-secondary social-button" @click="notice = 'Google 登入尚未串接，請使用 Email 展示流程。'"><span class="google-icon"><img :src="googleIcon" alt="" /></span>使用 Google 帳號繼續</button>
        <button class="btn btn-secondary social-button" @click="notice = 'Apple 登入尚未串接，請使用 Email 展示流程。'"><img class="apple-icon" :src="appleIcon" alt="" />使用 Apple 帳號繼續</button>
      </div>
      <p v-if="notice" class="field-error" role="status">{{ notice }}</p>
      <div class="legal"><p>繼續即表示您同意<span>服務條款</span>與<span>隱私權政策</span></p><p>還沒有帳號？選擇以上任一種方式，我們將為您建立帳號。</p></div>
    </template>
    <template v-else>
      <button v-if="step !== 'profile'" type="button" class="back-button" aria-label="返回上一步" @click="back"><img :src="backIcon" alt="" /></button>
      <form v-if="step === 'email'" novalidate @submit.prevent="sendCode">
        <header><h1>輸入您的 Email</h1><p>我們將使用您的 Email 進行驗證</p></header>
        <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email" :aria-invalid="!!error" aria-describedby="email-error" @input="error = ''" />
        <p v-if="error" id="email-error" class="field-error" role="alert">{{ error }}</p>
        <button class="btn btn-primary" type="submit">下一步</button>
      </form>
      <form v-else-if="step === 'code'" novalidate @submit.prevent="verifyCode">
        <header><h1>輸入驗證碼</h1><p>驗證碼已寄送至 <strong>{{ email }}</strong></p></header>
        <div class="otp-field" @click="otpInput?.focus()">
          <div class="otp-cells" aria-hidden="true"><span v-for="(_, index) in 6" :key="index" :class="{ current: index === Math.min(code.length, 5) }">{{ code[index] }}</span></div>
          <input ref="otpInput" :value="code" inputmode="numeric" autocomplete="one-time-code" aria-label="六位驗證碼" :aria-invalid="!!error" aria-describedby="code-error" @input="updateCode" />
        </div>
        <p v-if="error" id="code-error" class="field-error" role="alert">{{ error }}</p>
        <button class="btn btn-primary" type="submit">下一步</button>
        <button class="resend" type="button" :disabled="seconds > 0" @click="sendCode">沒有收到驗證碼？{{ seconds > 0 ? `${seconds} 秒後重新傳送` : '重新傳送' }}</button>
      </form>
      <form v-else-if="step === 'profile'" novalidate @submit.prevent="prepareProfile">
        <div class="avatar-card">
          <div class="avatar-holder"><img class="avatar-preview" :src="avatar || defaultAvatar" alt="目前頭像" /><button class="avatar-camera" type="button" aria-label="上傳頭像" @click="sheetOpen = true"><i class="fa-regular fa-camera" aria-hidden="true"></i></button></div>
          <p v-if="avatarError" class="field-error" role="alert">{{ avatarError }}</p>
          <div class="avatar-options"><button v-for="option in avatarOptions" :key="option.label" type="button" :aria-label="option.label" :aria-pressed="avatar === option.value" @click="avatar = option.value; avatarError = ''"><img :src="option.image" alt="" /></button></div>
        </div>
        <header class="profile-intro"><h1>歡迎加入！</h1><p>名稱和頭貼之後可以再修改</p></header>
        <label for="login-name">使用者名稱</label>
        <input id="login-name" v-model="name" autocomplete="nickname" placeholder="輸入您的名稱" :aria-invalid="!!error || nameTooLong" aria-describedby="name-error" @input="error = ''" />
        <p v-if="error || nameTooLong" id="name-error" class="field-error" role="alert">{{ error || '名稱最多 8 個中文字或 16 個英文字元。' }}</p>
        <button class="btn btn-primary" type="submit" :disabled="loadingPhoto">{{ loadingPhoto ? '圖片讀取中…' : '開始使用' }}</button>
      </form>
      <div v-else class="notifications-step">
        <div class="notification-hero"><img :src="notificationIcon" alt="" /><header><h1>開啟通知設定</h1><p>開啟通知後，補貨提醒與共享空間動態都能第一時間通知您</p></header></div>
        <button class="btn btn-primary" @click="finish(true)">允許通知</button>
        <button class="text-button" @click="finish(false)">暫不允許</button>
      </div>
    </template>
    <input ref="photoInput" type="file" accept="image/*" hidden @change="uploadPhoto" />
    <input ref="cameraInput" type="file" accept="image/*" capture="user" hidden @change="uploadPhoto" />
    <BottomSheet :open="sheetOpen" labelledby="login-avatar-title" @close="sheetOpen = false">
      <h2 id="login-avatar-title" class="visually-hidden">選擇頭像照片</h2>
      <div class="photo-options"><button type="button" @click="selectPhoto('camera')">拍照</button><button type="button" @click="selectPhoto('album')">從相簿選擇</button></div>
      <button type="button" class="btn btn-secondary" @click="sheetOpen = false">取消</button>
    </BottomSheet>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/page-header' as header;
@use '../assets/scss/profile-avatar' as avatar;
.login-page { position: relative; max-width: 345px; min-height: calc(100dvh - 34px); margin: 0 auto; padding: 52px 0 24px; color: t.$text-main; font-family: t.$font-family; box-sizing: border-box; }
h1 { @include header.page-title; line-height: 32px; }
p { margin: 0; }
header { margin-bottom: t.$space-24; p { margin-top: t.$space-8; color: t.$text-sub; font-size: t.$font-size-body; line-height: 22px; overflow-wrap: anywhere; } strong { color: t.$text-main; font-weight: t.$font-weight-medium; } }
.btn { width: 100%; min-height: 48px; font-family: inherit; }
form > .btn { margin-top: t.$space-24; }
input:not([type='file']) { width: 100%; box-sizing: border-box; height: 44px; border: 1px solid t.$border-color; border-radius: t.$radius-input; padding: 12px 16px; background: t.$input-bg; color: t.$text-main; box-shadow: t.$shadow-inset; font: t.$font-weight-regular #{t.$font-size-body} / 20px t.$font-family; &::placeholder { color: t.$text-disabled; } &:focus { outline: 1.5px solid t.$primary-green; outline-offset: 0; } }
.back-button { position: absolute; top: 52px; left: 0; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; }
.field-error { margin-top: 8px; padding: 8px 12px; background: t.$accent-soft; border-radius: t.$radius-md; color: t.$accent-text; font-size: t.$font-size-caption; line-height: 20px; }
.login-brand { display: flex; justify-content: center; align-items: center; height: 96px; margin-top: 108px; margin-bottom: t.$space-24; img { transform: scale(2.5); transform-origin: center; } }
.email-demo-fill { display: grid; place-items: center; width: 108px; height: 96px; padding: 0; border: 0; background: transparent; }
.welcome-hero { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; h1 { font-size: 28px; line-height: 34px; } p { color: t.$text-sub; font-size: t.$font-size-body; } }
.welcome-actions { display: flex; flex-direction: column; gap: 20px; margin-top: 32px; }
.method-divider { display: flex; align-items: center; gap: 12px; color: t.$text-disabled; font-size: t.$font-size-caption; line-height: 18px; &::before, &::after { content: ''; flex: 1; height: 1px; background: t.$border-color; } }
.social-button { position: relative; font-size: t.$font-size-body; }
.google-icon { position: absolute; left: 24px; top: 16px; width: 20px; height: 20px; img { position: absolute; left: 11.11%; right: 4.44%; top: 5.56%; bottom: 6.98%; } }
.apple-icon { position: absolute; left: 24px; top: 16px; }
.legal { margin-top: 32px; text-align: center; font-size: t.$font-size-caption; line-height: 18px; color: t.$text-sub; span { color: t.$primary-green; font-weight: t.$font-weight-bold; } p + p { margin-top: 8px; color: t.$text-disabled; } }
.otp-field { position: relative; .otp-cells { display: flex; gap: 8px; span { display: grid; place-items: center; flex: 1; height: 60px; border: 1px solid t.$border-color; border-radius: t.$radius-input; background: t.$surface-subtle; font-size: 28px; &.current { border: 1.5px solid t.$primary-green; } } } input { position: absolute; inset: 0; height: 60px; opacity: 0; cursor: text; } &:focus-within .current { outline: 1px solid t.$primary-green; } }
.resend, .text-button { width: 100%; min-height: 44px; padding: 8px 0; border: 0; background: transparent; color: t.$text-sub; font-family: inherit; }
.resend { margin-top: 16px; font-size: t.$font-size-caption; }
// LOGO 中心為 52 + 108 + 96 / 2 = 208px；主頭貼中心維持相同位置。
.avatar-card { margin-top: 84px; padding: 20px 24px 18px; border-radius: t.$radius-card; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.avatar-holder { position: relative; width: 140px; height: 124px; }
.avatar-preview { position: absolute; left: 18px; width: 104px; height: 104px; object-fit: cover; border-radius: t.$radius-pill; @include avatar.background; box-shadow: t.$shadow-raised; }
.avatar-camera { position: absolute; left: 94px; top: 78px; display: grid; place-items: center; width: 34px; height: 34px; border: 0; padding: 0; border-radius: t.$radius-pill; background: t.$primary-green; color: t.$text-inverse; box-shadow: t.$shadow-primary; }
.avatar-options { display: flex; gap: 18px; button { width: 45px; height: 45px; padding: 0; border: 2px solid transparent; border-radius: t.$radius-pill; @include avatar.background; box-shadow: t.$shadow-raised; img { width: 41px; height: 41px; border-radius: inherit; } &[aria-pressed='true'] { border-color: t.$primary-green; box-shadow: t.$shadow-inset; } } }
.profile-intro { margin-top: 16px; text-align: center; }
label { display: block; margin-bottom: 8px; color: t.$text-sub; font-size: t.$font-size-body-sm; font-weight: t.$font-weight-medium; }
.notifications-step { display: flex; flex-direction: column; min-height: max(360px, calc(100dvh - 110px)); }
.notification-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; header { text-align: center; } }
.text-button { font-size: t.$font-size-body-sm; font-weight: t.$font-weight-bold; margin-top: 8px; }
.photo-options button { width: 100%; min-height: 56px; padding: 16px 8px; border: 0; border-bottom: 1px solid t.$border-color; background: transparent; color: t.$text-main; text-align: left; font-family: t.$font-family; }
.photo-options + .btn { margin-top: 12px; }
button { cursor: pointer; }
button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; }
.photo-options button:focus, .photo-options + .btn:focus { outline: none; }
@media (max-width: 360px) { .avatar-options { gap: 12px; } .social-button { padding-inline: 46px 12px; font-size: t.$font-size-body-sm; } }
</style>
