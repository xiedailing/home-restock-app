<script setup>
// 首頁待買用品摘要卡（specs/004 FR-406）。Figma：Soft Summary Card / 待買（630:3249；Items = 0 為 988:2）。
// 與「最近更新」卡並排（HOME-09）。整張卡點擊前往購買清單。
import { computed } from 'vue'
import { STATUS } from '../../models/item'
import { getItemIconSrc } from '../../assets/household-icons-by-state/index.js'
import shoppingBagIcon from '../../assets/home/shopping-bag.svg'
import arrowIcon from '../../assets/home/summary-arrow.svg'

const props = defineProps({
  items: { type: Array, required: true }, // 購買清單中的用品
})

// Figma：1～3 項顯示全部圖示；4 項以上顯示 2 個圖示＋「+N」。依加入清單日期新到舊，同一天以較晚更新者在前。
const MAX_STAMPS = 3
const sortedItems = computed(() =>
  [...props.items].sort((a, b) =>
    (b.addedToShoppingListDate ?? '').localeCompare(a.addedToShoppingListDate ?? '') || b.updatedAt.localeCompare(a.updatedAt),
  ),
)
const stamps = computed(() => sortedItems.value.slice(0, props.items.length > MAX_STAMPS ? MAX_STAMPS - 1 : MAX_STAMPS))
const moreCount = computed(() => props.items.length - stamps.value.length)
</script>

<template>
  <RouterLink class="summary-card" :class="{ 'summary-card--empty': !items.length }" :to="{ name: 'shopping' }" :aria-label="`待買用品 ${items.length} 項，查看購買清單`">
    <div class="summary-title">
      <span class="summary-badge" aria-hidden="true"><img :src="shoppingBagIcon" alt="" /></span>
      <span>待買用品</span>
    </div>
    <img class="summary-arrow" :src="arrowIcon" alt="" />

    <p v-if="!items.length" class="summary-empty">目前沒有待買用品</p>
    <div v-else class="summary-count-row" aria-hidden="true">
      <p class="summary-count"><strong>{{ items.length }}</strong>項</p>
      <div class="summary-stamps">
        <span v-for="item in stamps" :key="item.id" class="summary-stamp">
          <img :class="{ 'item-photo': item.iconPhoto }" :src="getItemIconSrc(item, STATUS.IN_SHOPPING_LIST)" alt="" />
        </span>
        <span v-if="moreCount" class="summary-stamp summary-stamp--more">+{{ moreCount }}</span>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.summary-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 160px;
  padding: t.$space-20;
  border-radius: t.$radius-card;
  background: t.$summary-bg;
  box-shadow: t.$shadow-card;
  color: inherit;
  font-family: t.$font-family;
  text-decoration: none;
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; }
  // Figma Items = 0：保留原本無陰影設定。
  &--empty { box-shadow: none; }
}
.summary-title {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  color: #2e4f2e;
  font: t.$font-weight-bold 15px / normal t.$font-family;
}
.summary-badge {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: #e4efe1;
}
.summary-arrow { position: absolute; top: 26px; right: t.$space-20; }
.summary-empty { margin: 0; color: #809980; font: t.$font-weight-bold 17px / 57px t.$font-family; }
.summary-count-row { display: flex; align-items: flex-end; justify-content: space-between; }
.summary-count {
  display: flex;
  align-items: flex-end;
  gap: t.$space-4;
  margin: 0;
  color: #315c33;
  font: t.$font-weight-medium 15px / normal t.$font-family;
  strong { font-size: t.$font-size-display; line-height: normal; font-weight: t.$font-weight-bold; }
}
.summary-stamps { display: flex; align-items: center; }
.summary-stamp {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border: 2px solid t.$surface-bg;
  border-radius: 18px;
  background: t.$primary-subtle;
  & + & { margin-left: -10px; }
  img { width: 36px; height: 36px; object-fit: contain; }
  &--more {
    background: t.$active-green;
    box-shadow: inset 3px 3px 6px rgba(157, 187, 150, .35), inset -3px -3px 6px rgba(255, 255, 255, .9);
    color: t.$primary-green;
    font: t.$font-weight-bold 11px / normal t.$font-family;
  }
}
</style>
