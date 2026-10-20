<script setup>
import { ref } from 'vue'
import { withPresentationExclusive } from '../utils/presentationAccess.js'
import { applyPresentationSetup, exportPresentationBackup } from '../utils/presentationSetup.js'
const expectedSnapshot = ref(null)
const backedUp = ref(false), confirmed = ref(false), phrase = ref(''), busy = ref(false), message = ref('')
async function downloadBackup() {
  try {
    const backup = await withPresentationExclusive(() => exportPresentationBackup(localStorage))
    expectedSnapshot.value = JSON.parse(backup).before
    const blob = new Blob([backup], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `bubu-demo-backup-${Date.now()}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000); backedUp.value = true
  } catch (error) { message.value = error.message }
}
async function apply(restore) {
  if (busy.value || !backedUp.value || !confirmed.value || phrase.value !== '確認') return
  busy.value = true; message.value = ''
  try {
    await applyPresentationSetup({ restore, confirmed: true, expectedSnapshot: expectedSnapshot.value })
    backedUp.value = false; confirmed.value = false; phrase.value = ''
    message.value = restore ? '已還原備份的用品與空間；舊通知任務不會恢復。' : '已建立兩個空間、六項用品。請返回購買清單。'
  } catch (error) { message.value = error.message }
  finally { busy.value = false }
}
</script>
<template>
  <main class="presentation-setup">
    <h1>期末展示資料</h1>
    <p>此操作會替換本瀏覽器、此 Preview 網址的用品、空間、用品目錄與通知紀錄。推播偏好與瀏覽器通知權限保留。</p>
    <p>請關閉其他補補分頁，包括舊版本分頁；這個頁面不會啟動通知排程。</p>
    <button type="button" :disabled="busy" @click="downloadBackup">下載目前資料備份</button>
    <label><input v-model="confirmed" type="checkbox" :disabled="busy" />我已保存備份，並關閉其他補補分頁。</label>
    <label>輸入「確認」<input v-model="phrase" :disabled="busy" autocomplete="off" /></label>
    <button type="button" :disabled="busy || !backedUp || !confirmed || phrase !== '確認'" @click="apply(false)">建立／重置六項展示用品</button>
    <button type="button" :disabled="busy || !backedUp || !confirmed || phrase !== '確認'" @click="apply(true)">還原上次操作前的資料</button>
    <p role="status">{{ message }}</p>
    <a href="/shopping?notificationDemo=1">返回購買清單</a>
    <p>重置會自動保留最近一次操作前的站內備份；下載的 JSON 可另外留存。還原備份不會重新發送舊通知。</p>
  </main>
</template>
<style scoped>
.presentation-setup { max-width: 680px; margin: 40px auto; padding: 24px; line-height: 1.7; }
label { display: block; margin: 20px 0; }
button { display: block; margin: 16px 0; padding: 12px 20px; font: inherit; }
input:not([type=checkbox]) { color: #222; background: #fff; margin-left: 12px; }
</style>
