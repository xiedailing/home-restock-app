<script setup>
import { ref } from 'vue'
import { withPresentationExclusive } from '../utils/presentationAccess.js'
import { applyPresentationSetup, exportPresentationBackup } from '../utils/presentationSetup.js'
const busy = ref(false), message = ref('')
async function downloadBackup() {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {
    const backup = await withPresentationExclusive(() => exportPresentationBackup(localStorage))
    const blob = new Blob([backup], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `bubu-demo-backup-${Date.now()}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { message.value = error.message }
  finally { busy.value = false }
}
async function apply(restore) {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {
    // 只讀取快照，不強制下載；確認視窗期間的資料變更仍會被既有比對攔截。
    const expectedSnapshot = await withPresentationExclusive(() => JSON.parse(exportPresentationBackup(localStorage)).before)
    const prompt = restore
      ? '還原上次操作前的用品與空間？目前資料會自動備份，舊通知任務不會恢復。'
      : '恢復六項展示初始資料？目前資料會自動保留一版本地備份，舊通知任務會清除。請先關閉其他補補分頁。'
    if (!window.confirm(prompt)) return
    await applyPresentationSetup({ restore, confirmed: true, expectedSnapshot })
    window.location.assign('/shopping?notificationDemo=1')
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
    <button type="button" :disabled="busy" @click="apply(false)">恢復六項展示初始資料</button>
    <button type="button" :disabled="busy" @click="apply(true)">還原上次操作前的資料</button>
    <p role="status">{{ message }}</p>
    <a href="/shopping?notificationDemo=1">返回購買清單</a>
    <p>重置會自動保留最近一次操作前的站內備份；下載的 JSON 可另外留存。還原備份不會重新發送舊通知。</p>
  </main>
</template>
<style scoped>
.presentation-setup { max-width: 680px; margin: 40px auto; padding: 24px; line-height: 1.7; }
button { display: block; margin: 16px 0; padding: 12px 20px; font: inherit; }
</style>
