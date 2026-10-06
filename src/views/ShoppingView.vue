<script setup>
import { useItemsStore } from '../stores/items'
import SpaceTag from '../components/SpaceTag.vue'
import { getItemIcon } from '../assets/household-icons-by-state'
const store = useItemsStore()
const iconKeys = { '洗衣精': 'laundry-detergent', '衛生紙': 'tissues', '垃圾袋': 'trash-bags', '洗碗精': 'dish-soap', '狗狗糧食': 'dog-food' }
</script>
<template>
  <section class="shopping-page" aria-labelledby="shopping-title">
    <h1 id="shopping-title">購買清單</h1>
    <h2>我的清單</h2>
    <article v-for="item in store.shoppingList" :key="item.id" class="shopping-card">
      <img class="item-icon" :src="getItemIcon(item.iconKey || iconKeys[item.name])" alt="" />
      <div class="item-info">
        <h3>{{ item.name }}</h3>
        <SpaceTag :space-id="item.spaceId" />
        <p>補貨數量 {{ item.quantity ?? 1 }} {{ item.unit }}</p>
      </div>
    </article>
    <p v-if="!store.shoppingList.length" class="empty-message">目前沒有待買用品。</p>
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
.shopping-page { width: 100%; max-width: 358px; margin-inline: auto; padding-top: 16px; text-align: left; font-family: t.$font-family; color: t.$text-main; }
h1 { margin: 0 0 24px; font: 700 17px / 24px t.$font-family; }
h2 { margin: 0 0 16px; font: 700 16px / 22px t.$font-family; }
.shopping-card { display: flex; align-items: flex-start; gap: 14px; padding: 24px 20px; margin-bottom: 16px; background: t.$card-bg; border-radius: t.$radius-card; box-shadow: t.$shadow-card; }
.item-icon { width: 56px; height: 56px; object-fit: contain; }
.item-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; h3 { margin: 0; font: 700 20px / 28px t.$font-family; } p { margin: 0; font-size: 14px; color: t.$text-sub; } }
.empty-message { color: t.$text-sub; font-size: 14px; }
</style>
