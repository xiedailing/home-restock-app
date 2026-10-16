<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import GlobalItemEditor from '../components/settings/GlobalItemEditor.vue'
import backIcon from '../assets/settings/category-back.svg'
const catalog = useCatalogStore()
const route = useRoute()
const category = computed(() => String(route.params.category))
const items = computed(() => catalog.allItems.filter(item => item.category === category.value))
const editorOpen = ref(false)
const editingItem = ref(null)
function edit(item = null) {
  editingItem.value = item ? { ...item } : null
  editorOpen.value = true
}
</script>
<template>
  <section class="category-page">
    <header><RouterLink class="back-button" :to="{ name: 'item-management' }" aria-label="返回用品管理"><img :src="backIcon" alt="" /></RouterLink><h1>{{ category }}</h1><span /></header>
    <p class="preview-mode">全域用品可供所有空間選用；目前編輯與刪除尚未開放。</p>
    <div v-if="items.length" class="category-card">
      <button v-for="item in items" :key="item.id" type="button" class="item-row" @click="edit(item)">{{ item.name }}</button>
    </div>
    <div v-else class="category-empty" role="status"><h2>此分類尚無用品</h2><p>新增用品後會顯示於所選分類。</p></div>
    <RouterLink class="add-item" :to="{ name: 'add-item', query: { from: 'item-management', category } }">＋ 新增用品</RouterLink>
    <GlobalItemEditor :open="editorOpen" :item="editingItem" @close="editorOpen = false" />
  </section>
</template>
<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/space-layout' as layout;
.category-page { width: 100%; max-width: 358px; margin-inline: auto; padding-top: t.$space-16; color: t.$text-main; font-family: t.$font-family; text-align: left; }
header { min-height: 44px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; margin-bottom: t.$space-16; h1 { margin: 0; font-size: 17px; text-align: center; letter-spacing: .5px; overflow-wrap: anywhere; } }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: t.$radius-pill; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
.preview-mode { margin: 0 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; }
.category-card { overflow: hidden; border: 1px solid t.$border-color; border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; }
.item-row { box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; @include layout.row(48px, t.$space-16); border: 0; background: t.$card-bg; color: t.$text-body; text-align: left; font: t.$font-weight-regular #{t.$font-size-body-sm} / 20px t.$font-family; overflow-wrap: anywhere; &:not(:last-child) { border-bottom: 1px solid t.$border-color; } }
.category-empty { padding: t.$space-24 t.$space-16; text-align: center; h2 { margin: 0 0 t.$space-8; font-size: t.$font-size-card-title; } p { margin: 0; color: t.$text-sub; font-size: t.$font-size-body-sm; } }
.add-item { box-sizing: border-box; text-decoration: none; width: 100%; margin-top: t.$space-16; padding: t.$space-8 t.$space-16; display: flex; justify-content: center; align-items: center; min-height: t.$button-height; border: 0; border-radius: t.$radius-pill; background: t.$primary-soft; color: t.$primary-green; font: t.$font-weight-bold #{t.$font-size-button} / 22px t.$font-family; cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid t.$primary-green; outline-offset: -2px; }
</style>
