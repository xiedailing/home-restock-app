<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// 用品類別 pills（「我的用品」與補貨頁共用）：第一顆「全部」，單選，橫向捲動。
// 還能往右捲時右側出現霧狀漸層，捲到最右邊淡出；選中的 pill 在畫面外時自動捲進來（specs/009 FR-903）。
const props = defineProps({
  modelValue: { type: String, default: null },
  categories: { type: Array, required: true },
  label: { type: String, default: '用品類別' },
})
const emit = defineEmits(['update:modelValue'])

const list = ref(null)
const scrolledToEnd = ref(true)

function updateScrollEnd() {
  const el = list.value
  scrolledToEnd.value = !el || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
}

function revealSelected() {
  const el = list.value
  const selected = el?.querySelector('[aria-pressed="true"]')
  if (!selected) return
  const left = selected.parentElement.offsetLeft
  const right = left + selected.offsetWidth
  if (left < el.scrollLeft) el.scrollLeft = Math.max(left - 16, 0)
  else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 16
}

async function refresh() {
  await nextTick()
  revealSelected()
  updateScrollEnd()
}

watch([list, () => props.categories, () => props.modelValue], refresh, { flush: 'post' })
onMounted(() => {
  refresh()
  window.addEventListener('resize', updateScrollEnd)
})
onUnmounted(() => window.removeEventListener('resize', updateScrollEnd))
</script>

<template>
  <div class="category-strip" :class="{ 'category-strip--at-end': scrolledToEnd }">
    <ul ref="list" class="category-pills" :aria-label="label" @scroll.passive="updateScrollEnd">
      <li v-for="option in [null, ...categories]" :key="option ?? 'all'">
        <button
          type="button"
          class="category-pill"
          :class="{ 'category-pill--selected': modelValue === option }"
          :aria-pressed="modelValue === option"
          @click="emit('update:modelValue', option)"
        >{{ option ?? '全部' }}</button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.category-strip {
  position: relative;
  flex-shrink: 0;
  min-width: 0;

  // 右側霧狀漸層（頁面底色），上下延伸到 pills 陰影的範圍；不擋點擊。
  &::after {
    content: '';
    position: absolute;
    top: -16px;
    right: 0;
    bottom: -16px;
    width: 40px;
    background: linear-gradient(to right, rgba(t.$bg-main, 0), t.$bg-main);
    opacity: 1;
    transition: opacity .2s ease;
    pointer-events: none;
  }

  &--at-end::after { opacity: 0; }
}

// 上下各留 16px 讓 pill 陰影不被裁切，並以負 margin 抵銷。
.category-pills {
  display: flex;
  gap: t.$space-8;
  overflow-x: auto;
  margin: -16px 0;
  padding: 16px 4px;
  list-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.category-pills > li { flex-shrink: 0; }

.category-pill {
  border: 0;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 36px;
  padding-inline: 14px;
  border-radius: t.$radius-pill;
  background: t.$card-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-sub;
  font-size: t.$font-size-body-sm;
  line-height: 20px;
  white-space: nowrap;

  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}

.category-pill--selected { background: t.$primary-green; box-shadow: t.$shadow-primary; color: t.$text-inverse; font-weight: t.$font-weight-medium; }
</style>
