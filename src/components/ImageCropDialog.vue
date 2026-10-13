<script setup>
// 圓形裁切 Dialog（specs/008 FR-804）：版型與操作同設定頁的「調整頭貼」，輸出 256×256 JPEG。
// 父層呼叫 open(file)：檢查檔案後開啟；確認時 emit('apply', dataUrl)，檔案不合格或讀取失敗時 emit('error', message)。
import { computed, nextTick, ref, shallowRef } from 'vue'

const emit = defineEmits(['apply', 'error'])

const CROP_SIZE = 240
const OUTPUT_SIZE = 256
const OUTPUT_QUALITY = 0.85
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const dialog = ref(null)
const surface = ref(null)
const source = ref('')
const image = shallowRef(null)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
let drag = null

const baseScale = computed(() => image.value ? Math.max(CROP_SIZE / image.value.naturalWidth, CROP_SIZE / image.value.naturalHeight) : 1)
const width = computed(() => image.value ? image.value.naturalWidth * baseScale.value * zoom.value : CROP_SIZE)
const height = computed(() => image.value ? image.value.naturalHeight * baseScale.value * zoom.value : CROP_SIZE)
const imageStyle = computed(() => ({
  width: `${width.value}px`,
  height: `${height.value}px`,
  transform: `translate(${(CROP_SIZE - width.value) / 2 + offsetX.value}px, ${(CROP_SIZE - height.value) / 2 + offsetY.value}px)`,
}))

function clamp() {
  const maxX = (width.value - CROP_SIZE) / 2
  const maxY = (height.value - CROP_SIZE) / 2
  offsetX.value = Math.max(-maxX, Math.min(maxX, offsetX.value))
  offsetY.value = Math.max(-maxY, Math.min(maxY, offsetY.value))
}
function startDrag(event) {
  if (event.button !== 0) return
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: offsetX.value, startY: offsetY.value }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDrag(event) {
  if (!drag || drag.id !== event.pointerId) return
  offsetX.value = drag.startX + event.clientX - drag.x
  offsetY.value = drag.startY + event.clientY - drag.y
  clamp()
}
function endDrag(event) {
  if (drag?.id !== event.pointerId) return
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  drag = null
}
function moveByKey(event) {
  const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key]
  if (!delta) return
  event.preventDefault()
  offsetX.value += delta[0]
  offsetY.value += delta[1]
  clamp()
}

function reset() { source.value = ''; image.value = null; drag = null }
function cancel() { dialog.value?.close() }

function apply() {
  if (!image.value) return
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    // JPEG 沒有透明度；先鋪白底，避免透明 PNG 變黑。
    context.fillStyle = '#fff'
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    const scale = baseScale.value * zoom.value
    const sourceSize = CROP_SIZE / scale
    const sourceX = (image.value.naturalWidth - sourceSize) / 2 - offsetX.value / scale
    const sourceY = (image.value.naturalHeight - sourceSize) / 2 - offsetY.value / scale
    context.drawImage(image.value, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    const dataUrl = canvas.toDataURL('image/jpeg', OUTPUT_QUALITY)
    dialog.value?.close()
    emit('apply', dataUrl)
  } catch {
    emit('error', '無法處理圖片，請重新選擇。')
  }
}

async function open(file) {
  if (!file) return
  if (file.size > MAX_BYTES) { emit('error', '圖片大小不可超過 5 MB，請重新選擇。'); return }
  if (!ALLOWED_TYPES.includes(file.type)) { emit('error', '請選擇 JPG、PNG 或 WebP 圖片。'); return }
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    // 確認檔案能被瀏覽器辨識為圖片，再開啟裁切。
    image.value = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = data
    })
    source.value = data
    zoom.value = 1
    offsetX.value = offsetY.value = 0
    await nextTick()
    dialog.value?.showModal()
    surface.value?.focus()
  } catch {
    emit('error', '無法讀取圖片，請重新選擇。')
  }
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="icon-crop-dialog"
      aria-labelledby="icon-crop-title"
      aria-describedby="icon-crop-hint"
      @close="reset"
      @click="event => { if (event.target === dialog) cancel() }"
    >
      <h2 id="icon-crop-title">調整圖示</h2>
      <p id="icon-crop-hint">拖曳照片調整位置，或使用方向鍵移動。</p>
      <div
        ref="surface"
        class="icon-crop-surface"
        tabindex="0"
        aria-label="圖示裁切預覽"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="moveByKey"
      >
        <img v-if="source" :src="source" :style="imageStyle" alt="" draggable="false" />
        <span class="icon-crop-mask" aria-hidden="true"></span>
      </div>
      <label class="icon-crop-zoom">縮放<input v-model.number="zoom" type="range" min="1" max="3" step="0.01" @input="clamp" /></label>
      <div class="icon-crop-actions">
        <button type="button" class="btn btn-secondary" @click="cancel">取消</button>
        <button type="button" class="btn btn-primary" @click="apply">確認</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.icon-crop-dialog {
  box-sizing: border-box;
  width: min(320px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 24px;
  border: 0;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  color: t.$text-main;
  font-family: t.$font-family;
  h2 { margin: 0; font-size: t.$font-size-card-title; text-align: center; }
  p { margin: 8px 0 16px; color: t.$text-sub; font-size: t.$font-size-caption; text-align: center; }
  &::backdrop { background: rgba(29, 29, 31, .5); }
  &:focus { outline: none; }
}
.icon-crop-surface {
  position: relative;
  width: 240px;
  height: 240px;
  margin-inline: auto;
  overflow: hidden;
  background: t.$input-bg;
  touch-action: none;
  cursor: grab;
  user-select: none;
  &:active { cursor: grabbing; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
  img { position: absolute; top: 0; left: 0; max-width: none; pointer-events: none; }
}
.icon-crop-mask { position: absolute; inset: 0; border-radius: 50%; box-shadow: t.$shadow-raised; pointer-events: none; }
.icon-crop-zoom {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-block: 16px;
  font-size: t.$font-size-body-sm;
  input { flex: 1; min-width: 0; accent-color: t.$primary-green; }
}
.icon-crop-actions {
  display: flex;
  gap: 12px;
  .btn { flex: 1; }
  .btn-secondary:focus, .btn-secondary:focus-visible { outline: none; }
}
</style>
