<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ItemListRow from '../components/items/ItemListRow.vue'
import { useItemsStore } from '../stores/items'
import { CATEGORIES } from '../models/item'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import chevronIcon from '../assets/settings/chevron.svg'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-in-shopping-list-plain.svg'

// Figma 原始搜尋 SVG；嵌入資料網址，避免依賴會過期的素材 URL。
const searchIcon = 'data:image/svg+xml;base64,PHN2ZyBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBvdmVyZmxvdz0idmlzaWJsZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJJY29uIC8gU2VhcmNoIj4KPGNpcmNsZSBpZD0iRWxsaXBzZSIgY3g9IjgiIGN5PSI4IiByPSI1IiBzdHJva2U9IiM4Qjg4ODAiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBpZD0iVmVjdG9yIiBkPSJNMTMgMTNMMTcgMTciIHN0cm9rZT0iIzhCODg4MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9nPgo8L3N2Zz4K'

const { items, itemsWithStatus, spaces } = storeToRefs(useItemsStore())

// 搜尋字串與空間選擇僅留在頁面層，不進 store、不持久化。
const searchQuery = ref('')
const selectedSpaceId = ref(null) // null = 所有用品
const spaceMenuOpen = ref(false)

const selectedSpaceName = computed(
  () => spaces.value.find((space) => space.id === selectedSpaceId.value)?.name ?? '所有用品',
)

const spaceOptions = computed(() => [{ id: null, name: '所有用品' }, ...spaces.value])

function filterBySpace(list, spaceId) {
  return spaceId === null ? list : list.filter((item) => item.spaceId === spaceId)
}

// 空間是主要瀏覽 context；切換時（含切回所有用品）重置搜尋，不保留「搜尋 AND 空間」。
function selectSpace(spaceId) {
  spaceMenuOpen.value = false
  // 重新點選同一空間只關閉浮層，不重置搜尋。
  if (spaceId === selectedSpaceId.value) return
  selectedSpaceId.value = spaceId
  searchQuery.value = ''
}

// 每個篩選都是 (list) => list 的純函式；Phase 2 的空間／分類／狀態篩選可直接接在後面。
function filterByName(list, query) {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return list
  return list.filter((item) => item.name.toLocaleLowerCase().includes(keyword))
}

const spaceItems = computed(() => filterBySpace(itemsWithStatus.value, selectedSpaceId.value))
const selectedCategory = ref(null) // null = 全部；僅頁面層、單選、不持久化

function filterByCategory(list, category) {
  return category === null ? list : list.filter((item) => item.category === category)
}

// 空間 scope AND 搜尋 AND 分類。
const visibleItems = computed(() =>
  filterByCategory(filterByName(spaceItems.value, searchQuery.value), selectedCategory.value),
)

// 目前空間有用品、且搜尋或分類生效、結果為 0；與「完全沒有用品」分開判斷。
const trimmedQuery = computed(() => searchQuery.value.trim())
const showSearchNoResults = computed(
  () =>
    spaceItems.value.length > 0 &&
    (trimmedQuery.value !== '' || selectedCategory.value !== null) &&
    visibleItems.value.length === 0,
)

// 清除目前生效的搜尋與分類（不影響空間）。
function clearFilters() {
  searchQuery.value = ''
  selectedCategory.value = null
}

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
            <h1 id="inventory-title">{{ selectedSpaceId === null ? '所有用品' : selectedSpaceName }}</h1>
            <button
              type="button"
              class="space-chevron"
              :aria-expanded="spaceMenuOpen"
              aria-haspopup="listbox"
              aria-label="切換空間"
              @click="spaceMenuOpen = !spaceMenuOpen"
            >
              <img :src="chevronIcon" alt="" />
            </button>
          </div>
          <p class="inventory-subtitle">共 {{ spaceItems.length }} 項用品</p>
        </div>
        <img class="profile-avatar" :src="profile.avatar || defaultAvatar" alt="個人頭像" />

        <!-- Space Popover：浮層，不推動下方版面。 -->
        <template v-if="spaceMenuOpen">
          <div class="space-popover-backdrop" @click="spaceMenuOpen = false" />
          <div class="space-popover" role="listbox" aria-label="空間切換">
            <button
              v-for="option in spaceOptions"
              :key="option.id ?? 'all'"
              type="button"
              role="option"
              class="space-option"
              :class="{ 'space-option--selected': selectedSpaceId === option.id }"
              :aria-selected="selectedSpaceId === option.id"
              @click="selectSpace(option.id)"
            >
              <span>{{ option.name }}</span>
              <svg v-if="selectedSpaceId === option.id" class="space-check" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <div class="space-popover-divider" />
            <!-- 視覺入口；本階段尚未提供新增空間流程。 -->
            <button type="button" class="space-option space-action" aria-disabled="true">
              <svg class="space-plus" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M9 3v12M3 9h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
              <span>新增空間</span>
            </button>
          </div>
        </template>
      </header>

      <template v-if="items.length">
        <!-- 搜尋已啟用；狀態篩選尚未啟用。 -->
        <div class="inventory-toolbar">
          <div class="inventory-search">
            <img class="search-icon" :src="searchIcon" alt="" />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="搜尋用品"
              aria-label="搜尋用品"
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
            <li>
              <button
                type="button"
                class="category-pill"
                :class="{ 'category-pill--selected': selectedCategory === null }"
                :aria-pressed="selectedCategory === null"
                @click="selectedCategory = null"
              >全部</button>
            </li>
            <li v-for="category in CATEGORIES" :key="category">
              <button
                type="button"
                class="category-pill"
                :class="{ 'category-pill--selected': selectedCategory === category }"
                :aria-pressed="selectedCategory === category"
                @click="selectedCategory = category"
              >{{ category }}</button>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <div v-if="showSearchNoResults" class="inventory-empty" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <img :src="emptyItemIcon" alt="" />
      </div>
      <div class="empty-copy">
        <h2>{{ trimmedQuery ? `找不到「${trimmedQuery}」` : '沒有符合條件的用品' }}</h2>
        <p>{{ trimmedQuery ? '試試其他關鍵字，或調整篩選條件' : '試試其他分類，或清除篩選條件' }}</p>
      </div>
      <button type="button" class="empty-clear" @click="clearFilters">
        {{ selectedCategory === null ? '清除搜尋' : '清除篩選' }}
      </button>
    </div>

    <ul v-else-if="spaceItems.length" class="item-list" aria-label="我的用品列表">
      <ItemListRow v-for="item in visibleItems" :key="item.id" :item="item" :spaces="spaces" />
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$space-16;
  min-height: 52px;
}

.inventory-heading { min-width: 0; }

.space-popover-backdrop { position: fixed; inset: 0; z-index: 1; }

.space-popover {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 9px;
  border: 1px solid t.$border-color;
  border-radius: 22px;
  background: t.$card-bg;
  box-shadow: 0 -3px 10px rgba(255, 255, 255, .4), 0 10px 28px rgba(140, 136, 127, .14);
}

.space-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
  width: 100%;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: t.$text-main;
  font: t.$font-weight-regular 15px / normal t.$font-family;
  text-align: left;
  cursor: pointer;

  &--selected {
    background: t.$active-green;
    box-shadow: inset -1px -1px 4px rgba(255, 255, 255, .85), inset 1px 2px 5px rgba(138, 158, 136, .1);
    color: t.$primary-green;
    font-weight: t.$font-weight-bold;
  }
}

.space-check, .space-plus { flex: 0 0 18px; width: 18px; height: 18px; }

.space-popover-divider { height: 1px; margin-block: 4px; background: t.$border-color; }

.space-action {
  justify-content: flex-start;
  color: t.$primary-green;
  cursor: default;
}
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
  padding: 0;
  border: 0;
  color: inherit;
  cursor: pointer;
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
    cursor: text;
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
  padding: 16px 4px 16px 4px;
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

.empty-copy h2 { overflow-wrap: anywhere; }

.empty-clear {
  width: 140px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  color: t.$text-sub;
  font: t.$font-weight-medium #{t.$font-size-button} / 20px t.$font-family;
  cursor: pointer;
}

.add-symbol { font-size: 20px; line-height: 1; }

@media (max-height: 600px) {
  .inventory-page { padding-top: t.$space-16; padding-bottom: t.$space-12; }
  .inventory-empty { gap: t.$space-16; }
}
</style>
