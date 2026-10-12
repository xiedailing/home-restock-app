<script setup>
// 首頁「最近更新」卡（specs/004 FR-408，HOME-11）。Figma：Proposal / Soft Recent Update Card（992:2）
// State=Default（有資料，可點）／Empty（985:2，尚無更新紀錄）。首頁寬 132，空狀態不放第二行說明。
// 資料來自購買清單「已補貨」區：最近一筆自己完成的購買，24 小時後隨購買清單一起消失。
import { computed } from 'vue'
import emptyIcon from '../../assets/home/recent-update-empty.svg'
import recentIcon from '../../assets/home/recent-update.svg'
import arrowIcon from '../../assets/home/summary-arrow.svg'

const props = defineProps({
  item: { type: Object, default: null }, // 最近完成購買的用品（含 shoppingCompletedAt）；沒有則顯示空狀態
})

const pad = (value) => String(value).padStart(2, '0')
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
// 卡片寬度只放得下「已補貨・HH:mm」：當天顯示時間，跨過午夜（24 小時內最多跨一天）顯示「已補貨・昨天」。
const timeLabel = computed(() => {
  if (!props.item) return ''
  const completed = new Date(props.item.shoppingCompletedAt)
  if (dayKey(completed) !== dayKey(new Date())) return '已補貨・昨天'
  return `已補貨・${pad(completed.getHours())}:${pad(completed.getMinutes())}`
})
</script>

<template>
  <RouterLink
    v-if="item"
    class="recent-card recent-card--filled"
    :to="{ name: 'shopping' }"
    :aria-label="`最近更新：${item.name}，${timeLabel}，查看購買清單`"
  >
    <img class="recent-icon" :src="recentIcon" alt="" />
    <img class="recent-arrow" :src="arrowIcon" alt="" />
    <h2 class="recent-title">最近更新</h2>
    <div class="recent-body" aria-hidden="true">
      <p class="recent-action">{{ item.name }}</p>
      <p class="recent-time">{{ timeLabel }}</p>
    </div>
  </RouterLink>

  <section v-else class="recent-card" aria-labelledby="recent-update-title">
    <img class="recent-icon" :src="emptyIcon" alt="" />
    <h2 id="recent-update-title" class="recent-title">最近更新</h2>
    <p class="recent-empty">尚無更新紀錄</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

// 尺寸與內距同首頁 693:3840（132×160）；空狀態無陰影，同待買 Items = 0。
.recent-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  height: 160px;
  padding: 18px t.$space-16;
  border: 1px solid rgba(241, 237, 230, .25);
  border-radius: 26px;
  background: #fffdfa;
  color: inherit;
  font-family: t.$font-family;
  text-decoration: none;
  // 有資料：可點、有陰影、內容較多所以間距縮小。
  &--filled {
    gap: 10px;
    box-shadow: t.$shadow-card;
    &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; }
  }
}
.recent-icon { display: block; }
.recent-arrow { position: absolute; top: 18px; right: 10px; }
.recent-title { margin: 0; color: #2b2a26; font: t.$font-weight-bold 18px / normal t.$font-family; }
.recent-empty { margin: 0; color: #8b8880; font: t.$font-weight-medium 14px / 21px t.$font-family; }
.recent-body { width: 100%; min-width: 0; }
.recent-action { margin: 0; overflow: hidden; color: #2b2a26; font: t.$font-weight-bold 12px / 21px t.$font-family; text-overflow: ellipsis; white-space: nowrap; }
.recent-time { margin: 0; color: #8b8880; font: t.$font-weight-regular 12px / 20px t.$font-family; white-space: nowrap; }
</style>
