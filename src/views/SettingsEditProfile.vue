<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { profile, updateProfile } from '../stores/profile'
import { defaultAvatar, avatarOptions } from '../assets/household-icons-by-state/avatars/index.js'

const router = useRouter()
// 表單使用副本；按取消不會更改設定頁的資料。
const name = ref(profile.name)
const avatar = ref(profile.avatar)
const error = ref('')
const loadingImage = ref(false)
const isDirty = computed(() => name.value !== profile.name || avatar.value !== profile.avatar)

async function selectAvatar(event) {
  const file = event.target.files?.[0]
  if (!file) return
  error.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    error.value = '請選擇 2 MB 以下的 JPG、PNG 或 WebP 圖片。'
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
    await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = resolve
      image.onerror = reject
      image.src = data
    })
    avatar.value = data
  } catch {
    error.value = '無法讀取圖片，請重新選擇。'
  } finally {
    loadingImage.value = false
    event.target.value = ''
  }
}

function save() {
  if (loadingImage.value) return
  try {
    updateProfile({ name: name.value, avatar: avatar.value })
    router.push({ name: 'settings' })
  } catch (cause) {
    error.value = cause.message
  }
}
</script>

<template>
  <section class="edit-profile-page" aria-labelledby="edit-profile-title">
    <header class="page-header">
      <RouterLink :to="{ name: 'settings' }" class="back-link" aria-label="返回設定">‹</RouterLink>
      <h1 id="edit-profile-title">個人檔案設定</h1>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <form @submit.prevent="save">
      <div class="avatar-card">
        <div class="avatar-preview">
          <img v-if="avatar" class="uploaded-avatar" :src="avatar" alt="頭像預覽" />
          <img v-else class="default-avatar" :src="defaultAvatar" alt="預設頭像" />
          <label class="avatar-upload" aria-label="上傳頭像">
            <i class="fa-solid fa-camera" aria-hidden="true"></i>
            <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="loadingImage" aria-label="上傳頭像，限 2 MB 以下 JPG、PNG 或 WebP" @change="selectAvatar" />
          </label>
        </div>
        <div class="avatar-options" role="group" aria-label="選擇頭像">
          <button v-for="option in avatarOptions" :key="option.label" type="button" class="avatar-option" :class="{ selected: avatar === option.value }" :aria-label="option.label + '頭像'" :aria-pressed="avatar === option.value" :disabled="loadingImage" @click="avatar = option.value">
            <img :src="option.image" alt=""  />
          </button>
        </div>
      </div>

      <div class="card profile-form">
        <div class="profile-row">
          <span class="field-label"><i class="fa-regular fa-user" aria-hidden="true"></i>登入帳號</span>
          <span class="account-value" aria-label="登入帳號，不可修改">{{ profile.email }}</span>
        </div>
        <div class="profile-row">
          <label for="edit-profile-name" class="field-label"><i class="fa-solid fa-pencil" aria-hidden="true"></i>暱稱</label>
          <input id="edit-profile-name" v-model="name" class="form-control nickname-input" placeholder="輸入暱稱" required maxlength="30" autocomplete="nickname" />
        </div>
      </div>
      <p class="hint">共享成員會看到：{{ name.trim() || profile.name }} 認購（帳號開頭）</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div v-if="isDirty || loadingImage" class="form-actions">
        <RouterLink :to="{ name: 'settings' }" class="btn btn-secondary">取消</RouterLink>
        <button type="submit" class="btn btn-primary" :disabled="loadingImage">{{ loadingImage ? '讀取圖片中…' : '儲存變更' }}</button>
      </div>
    </form>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.edit-profile-page { max-width: 358px; min-height: calc(100svh - 34px); margin-inline: auto; padding-top: 16px; text-align: left; color: t.$text-main; font-family: t.$font-family; }
.page-header { display: flex; align-items: center; justify-content: space-between; min-height: 44px; margin-bottom: 16px; }
.page-header h1 { margin: 0; color: t.$text-main; font: 700 17px / 24px t.$font-family; letter-spacing: 0; }
.back-link { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: t.$input-bg; box-shadow: t.$shadow-raised; font-size: 32px; line-height: 1; color: t.$text-main; text-decoration: none; }
.header-spacer { width: 44px; }
.avatar-card { display: flex; flex-direction: column; align-items: center; gap: 34px; padding: 32px 24px 28px; border-radius: 28px; background: t.$card-bg; box-shadow: t.$shadow-card; }
.avatar-preview { position: relative; width: 104px; height: 104px; }
.default-avatar { width: 104px; height: 104px; border-radius: 50%; box-shadow: t.$shadow-raised; }
.uploaded-avatar { width: 104px; height: 104px; object-fit: cover; border-radius: 50%; box-shadow: t.$shadow-raised; }
.avatar-upload { position: absolute; right: -6px; bottom: -8px; display: grid; place-items: center; width: 34px; height: 34px; border: 2px solid #dce6d6; border-radius: 50%; background: t.$primary-green; box-shadow: t.$shadow-raised; color: white; font-size: 17px; cursor: pointer; }
.avatar-upload input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.avatar-options { display: flex; justify-content: center; gap: 16px; width: 100%; }
.avatar-option { position: relative; flex: 0 0 46px; height: 46px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: #e3efe1; cursor: pointer; }
.avatar-option img { display: block; width: 42px; height: 42px; border-radius: 50%; }
.avatar-option.selected { border-color: #196b3e; }
.avatar-upload:focus-within, .back-link:focus-visible, .avatar-option:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 4px; }
.profile-form { margin-top: 46px; padding: 0; border-radius: 20px; background: t.$card-bg; overflow: hidden; }
.profile-row { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 10px 16px; position: relative; }
.profile-row + .profile-row::before { content: ''; position: absolute; top: 0; left: 16px; right: 0; height: 1px; background: t.$border-color; }
.field-label { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin: 0; font-size: 14px; color: t.$text-body; }
.field-label i { width: 16px; text-align: center; color: t.$text-sub; }
.account-value { margin-left: auto; min-width: 0; overflow-wrap: anywhere; text-align: right; color: t.$text-disabled; font-size: 14px; }
.nickname-input { margin-left: auto; width: 60%; min-width: 0; padding: 8px 12px; border: 0; border-radius: 16px; font-size: 14px; background: t.$input-bg; box-shadow: t.$shadow-inset; }
.nickname-input::placeholder { color: t.$text-disabled; }
.hint { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: t.$text-sub; }
.error-message { margin: 16px 0 0; color: t.$danger; font-size: 14px; }
.form-actions { display: flex; gap: 12px; margin-top: 24px; }
.form-actions .btn { flex: 1; font-size: 15px; }
@media (max-width: 360px) { .avatar-options { gap: 12px; } .profile-row { padding-inline: 12px; gap: 8px; } .account-value { font-size: 12px; } }
</style>
