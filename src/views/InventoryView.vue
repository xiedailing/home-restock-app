<script setup>
import { storeToRefs } from 'pinia'
import ItemListRow from '../components/items/ItemListRow.vue'
import { useItemsStore } from '../stores/items'
import { CATEGORIES } from '../models/item'
import { profile } from '../stores/profile'
import { defaultAvatar } from '../assets/household-icons-by-state/avatars/index.js'
import chevronIcon from '../assets/settings/chevron.svg'
import emptyItemIcon from '../assets/household-icons-by-state/common/generic-item-happy.svg'

const { items, itemsWithStatus, spaces } = storeToRefs(useItemsStore())
</script>

<template>
  <section class="inventory-page" aria-labelledby="inventory-title">
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
      <!-- Phase 1 僅呈現分類；切換與篩選留待 Phase 2。 -->
      <div class="category-strip">
        <ul class="category-pills" aria-label="用品分類">
          <li class="category-pill category-pill--selected">全部</li>
          <li v-for="category in CATEGORIES" :key="category" class="category-pill">
            {{ category }}
          </li>
        </ul>
      </div>
      <ul class="item-list" aria-label="我的用品列表">
        <ItemListRow v-for="item in itemsWithStatus" :key="item.id" :item="item" :spaces="spaces" />
      </ul>
    </template>

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
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-top: 60px;
  padding-bottom: t.$space-24;
  display: flex;
  flex-direction: column;
  gap: t.$space-16;
  color: t.$text-main;
  font-family: t.$font-family;
  letter-spacing: 0;
  text-align: left;
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

.category-strip {
  position: relative;
  min-width: 0;
  &::after {
    content: '';
    position: absolute;
    inset: 0 0 0 auto;
    width: 32px;
    pointer-events: none;
    background: linear-gradient(to right, transparent, t.$bg-main);
  }
}

.category-pills {
  display: flex;
  gap: t.$space-8;
  overflow-x: auto;
  margin: -6px -4px;
  padding: 6px 36px 6px 4px;
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
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 1px solid t.$border-color;
  border-radius: t.$radius-input;
  background: t.$card-bg;
  list-style: none;
}

.inventory-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: t.$space-32; min-height: 560px; text-align: center; }

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
</style>
