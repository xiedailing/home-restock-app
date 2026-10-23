<script setup>
import { getItemIconSrc } from '../../assets/household-icons-by-state/index.js'
import { ITEM_STATUS } from '../../models/item'

// 補貨頁的用品格子（specs/009 FR-904）：4 欄，第一格固定「＋新增用品」，點格子切換選取。
// items：全域用品（順序由 catalog.allItems 決定，這裡不重排）；selectedIds：已選的全域用品 id。
// locked：被其他成員認領的用品，{ 全域用品 id: 認領者名字 }（specs/009 FR-915）；不能選取，點了通知頁面說明原因。
defineProps({
  items: { type: Array, required: true },
  selectedIds: { type: Array, required: true },
  locked: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['toggle', 'new-item', 'blocked'])
</script>

<template>
  <ul class="item-grid">
    <li>
      <button type="button" class="tile tile--new" @click="emit('new-item')">
        <span class="tile-pic" aria-hidden="true">＋</span>
        <span class="tile-name">新增用品</span>
      </button>
    </li>
    <li v-for="item in items" :key="item.id">
      <button
        type="button"
        class="tile"
        :class="{ 'tile--selected': selectedIds.includes(item.id), 'tile--locked': !!locked[item.id] }"
        :aria-pressed="selectedIds.includes(item.id)"
        :aria-disabled="locked[item.id] ? 'true' : null"
        :aria-label="locked[item.id] ? `${item.name}，${locked[item.id]}認領中` : null"
        @click="locked[item.id] ? emit('blocked', item.id) : emit('toggle', item.id)"
      >
        <span class="tile-pic" :class="{ 'tile-pic--photo': item.iconPhoto }" aria-hidden="true">
          <img :src="getItemIconSrc(item, ITEM_STATUS.IN_STOCK)" :class="{ 'tile-photo': item.iconPhoto }" alt="" />
        </span>
        <span class="tile-name">{{ item.name }}</span>
        <span v-if="selectedIds.includes(item.id)" class="tile-check" aria-hidden="true">✓</span>
        <template v-if="locked[item.id]">
          <span class="tile-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
          <span class="tile-claimer" aria-hidden="true"><span class="tile-claimer-name">{{ locked[item.id] }}</span><span>認領中</span></span>
        </template>
      </button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.item-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tile {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$space-4;
  padding: 8px 2px 6px;
  border: 2px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular #{t.$font-size-metadata} / 1.3 t.$font-family;
  cursor: pointer;

  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }

  &--selected {
    border-color: t.$primary-green;
    background: t.$primary-soft;
    color: t.$dark-green;
    font-weight: t.$font-weight-bold;
    .tile-pic { background: t.$surface-bg; }
  }

  // 被其他成員認領：圖示變淡、名稱改次要色；仍可點（點了出提示），所以不用 disabled。
  &--locked {
    .tile-pic { opacity: .45; }
    .tile-name { color: t.$text-sub; }
  }

  &--new {
    color: t.$primary-green;
    font-weight: t.$font-weight-bold;
    .tile-pic {
      background: t.$input-bg;
      box-shadow: t.$shadow-raised;
      color: t.$primary-green;
      font-size: 26px;
      line-height: 1;
    }
  }
}

.tile-pic {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: t.$icon-circle-bg;
  img { width: 40px; height: 40px; object-fit: contain; }
  .tile-photo { border-radius: 50%; object-fit: cover; }
}

.tile-name {
  max-width: 100%;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-align: center;
}

// 小鎖與「{名字}認領中」：底色同 StatusMarks 的橘色 pill；名字太長以省略號截斷，「認領中」固定顯示。
.tile-lock {
  position: absolute;
  top: 2px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffebd7;
  color: t.$accent-text;
  font-size: 10px;
}
.tile-claimer {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
  color: t.$accent-text;
  font: t.$font-weight-medium 11px / 1.2 t.$font-family;
  white-space: nowrap;
  > span:last-child { flex: none; }
}
.tile-claimer-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.tile-check {
  position: absolute;
  top: 2px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: t.$primary-green;
  color: t.$text-inverse;
  font: t.$font-weight-bold 12px / 1 t.$font-family;
}
</style>

<style scoped>
.tile-pic.tile-pic--photo { background: transparent; }
</style>
