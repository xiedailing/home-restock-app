<script setup>
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ItemListRow from '../components/items/ItemListRow.vue'
import { useItemsStore } from '../stores/items'
import { CATEGORIES } from '../models/item'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import chevronIcon from '../assets/settings/chevron.svg'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-happy.svg'

// Figma 原始搜尋 SVG；嵌入資料網址，避免依賴會過期的素材 URL。
const searchIcon = 'data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJJY29uIC8gU2VhcmNoIj4KPGNpcmNsZSBpZD0iRWxsaXBzZSIgY3g9IjgiIGN5PSI4IiByPSI1IiBzdHJva2U9IiM4Qjg4ODAiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBpZD0iVmVjdG9yIiBkPSJNMTMgMTNMMTcgMTciIHN0cm9rZT0iIzhCODg4MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8L3N2Zz4K'

const { items, itemsWithStatus, spaces } = storeToRefs(useItemsStore())
const categoryPills = ref(null)
const showCategoryFade = ref(false)
const showLeftCategoryFade = ref(false)

function updateCategoryFade() {
  const element = categoryPills.value
  showLeftCategoryFade.value = !!element && element.scrollWidth - element.clientWidth > 1 && element.scrollLeft > 1
  showCategoryFade.value = !!element && element.scrollWidth - element.clientWidth - element.scrollLeft > 1
}

watch(categoryPills, (element, _previous, onCleanup) => {
  updateCategoryFade()
  if (!element) return

  // 視窗尺寸或字體載入改變分類寬度時，也重新判斷兩側是否還有內容。
  const observer = new ResizeObserver(updateCategoryFade)
  observer.observe(element)
  for (const pill of element.children) observer.observe(pill)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
</script>

<template>
  <section class="inventory-page" aria-labelledby="inventory-title">
    <div class="inventory-sticky-header">
      <header class="inventory-header">
        <div class="inventory-heading">
          <div class="inventory-title-row">
            <h1 id="inventory-title">我的用品</h1>
            <span class="space-chevron" aria-hidden="true">
              <img :src="chevronIcon" alt="" />
            </span>
          </div>
          <p class="inventory-subtitle">所有用品・共 {{ items.length }} 項用品</p>
        </div>
        <img class="profile-avatar" :src="profile.avatar || defaultAvatar" alt="個人頭像" />
      </header>

      <template v-if="items.length">
        <!-- 僅呈現工具列視覺；搜尋與狀態篩選尚未啟用。 -->
        <div class="inventory-toolbar">
          <div class="inventory-search">
            <img class="search-icon" :src="searchIcon" alt="" />
            <input
              type="search"
              placeholder="搜尋用品"
              aria-label="搜尋用品"
              aria-disabled="true"
              readonly
              tabindex="-1"
            />
          </div>
          <button
            type="button"
            class="status-filter-button"
            aria-label="狀態篩選"
            aria-disabled="true"
            tabindex="-1"
          >
            <span class="filter-icon" aria-hidden="true"><span /><span /><span /></span>
          </button>
        </div>

        <!-- Phase 1 僅呈現分類；切換與篩選留待 Phase 2。 -->
        <div
          class="category-strip"
          :class="{
            'category-strip--has-more': showCategoryFade,
            'category-strip--has-previous': showLeftCategoryFade,
          }"
        >
          <ul ref="categoryPills" class="category-pills" aria-label="用品分類" @scroll.passive="updateCategoryFade">
            <li class="category-pill category-pill--selected">全部</li>
            <li v-for="category in CATEGORIES" :key="category" class="category-pill">
              {{ category }}
            </li>
          </ul>
        </div>
      </template>
    </div>

    <ul v-if="items.length" class="item-list" aria-label="我的用品列表">
      <ItemListRow v-for="item in itemsWithStatus" :key="item.id" :item="item" :spaces="spaces" />
    </ul>

    <div v-else class="inventory-empty" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <img :src="emptyItemIcon" alt="" />
      </div>
      <div class="empty-copy">
        <h2>目前沒有用品</h2>
        <p>新增第一項用品，開始追蹤補貨提醒</p>
      </div>
      <!-- 視覺入口；本階段尚未提供新增流程。 -->
      <button type="button" class="btn btn-primary empty-add" aria-disabled="true">
        <span class="add-symbol" aria-hidden="true">＋</span>
        新增用品
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.inventory-page {
  // App.vue 已預留 34px 底部距離＋106px 導覽區，避免重複撐高整頁。
  min-height: calc(100vh - 140px);
  min-height: calc(100dvh - 140px);
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-bottom: t.$space-24;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  color: t.$text-main;
  font-family: t.$font-family;
  letter-spacing: 0;
  text-align: left;
}

.inventory-sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  flex-shrink: 0;
  padding-bottom: t.$space-8;
  background: t.$bg-main;
}

.inventory-header,
.inventory-toolbar,
.category-strip {
  flex-shrink: 0;
}

.inventory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$space-16;
  min-height: 52px;
}

.inventory-heading { min-width: 0; }
.inventory-title-row { display: flex; align-items: center; gap: t.$space-8; }

h1 {
  margin: 0;
  color: t.$text-main;
  font: t.$font-weight-bold #{t.$font-size-page-title} / #{t.$line-height-page-title} t.$font-family;
  letter-spacing: 0;
}

.space-chevron {
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  img { transform: rotate(90deg); }
}

.inventory-subtitle { margin: 2px 0 0; color: t.$text-sub; font-size: t.$font-size-metadata; line-height: 18px; }

.profile-avatar {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: t.$radius-pill;
  object-fit: cover;
  box-shadow: t.$shadow-raised;
}

.inventory-toolbar {
  display: flex;
  align-items: center;
  gap: t.$space-8;
  height: 44px;
}

.inventory-search {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 44px;
  gap: t.$space-8;
  padding-inline: 14px;
  border: 0;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-inset;

  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: t.$text-main;
    font: t.$font-weight-regular #{t.$font-size-body} / 20px t.$font-family;
    letter-spacing: 0;
    appearance: none;
    cursor: default;
    &::placeholder { color: t.$text-disabled; opacity: 1; }
  }
}

.search-icon { display: block; flex: 0 0 20px; }

.status-filter-button {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-popover;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-main;
  cursor: default;
}

.filter-icon {
  position: relative;
  display: block;
  width: 20px;
  height: 20px;
  span { position: absolute; height: 2px; border-radius: 1px; background: currentColor; }
  span:nth-child(1) { top: 4px; left: 2px; width: 16px; }
  span:nth-child(2) { top: 9px; left: 5px; width: 10px; }
  span:nth-child(3) { top: 14px; left: 8px; width: 4px; }
}

.category-strip {
  position: relative;
  min-width: 0;
  // 對包含陰影的整個捲動區淡出，避免額外覆蓋層的硬切邊。
  &--has-more .category-pills {
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
  }
  &--has-previous .category-pills {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 32px);
    mask-image: linear-gradient(to right, transparent, #000 32px);
  }
  &--has-previous.category-strip--has-more .category-pills {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
  }
}

.category-pills {
  display: flex;
  gap: t.$space-8;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  margin: -16px 0;
  padding: 16px 16px 16px 4px;
  list-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.category-pill {
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
}

.category-pill--selected { background: t.$primary-green; box-shadow: t.$shadow-primary; color: t.$text-inverse; font-weight: t.$font-weight-medium; }

.item-list {
  flex-shrink: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-input;
  background: t.$card-bg;
  list-style: none;
}

.inventory-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: t.$space-32; text-align: center; }
.inventory-empty > * { flex-shrink: 0; }

.empty-illustration {
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: t.$radius-pill;
  background: t.$active-green;
  box-shadow: inset -3px -3px 7px rgba(255, 255, 255, .9), inset 2px 3px 7px rgba(138, 158, 136, .16);
}

.empty-copy {
  width: 100%;
  min-height: 76px;
  h2 { margin: 0 0 2px; color: t.$text-main; font: t.$font-weight-bold #{t.$font-size-heading} / 30px t.$font-family; letter-spacing: 0; }
  p { max-width: 318px; margin: 0 auto; color: t.$text-sub; font-size: t.$font-size-body-sm; line-height: 22px; }
}

.empty-add {
  width: 222px;
  min-height: 48px;
  height: 48px;
  padding-block: 0;
  font-size: t.$font-size-button;
  cursor: default;
  &:hover, &:active { background: t.$primary-green; }
}

.add-symbol { font-size: 20px; line-height: 1; }

@media (max-height: 600px) {
  .inventory-page { padding-top: t.$space-16; padding-bottom: t.$space-12; }
  .inventory-empty { gap: t.$space-16; }
}
</style>
