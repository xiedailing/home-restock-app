<script setup>
// 補貨紀錄完整列表（specs/003 FR-307，003-B）。Figma：1246:7839。
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { useToast } from '../composables/useToast'
import AppToast from '../components/AppToast.vue'
import RestockRecordList from '../components/item-detail/RestockRecordList.vue'
import backIcon from '../assets/add-item/back-chevron.svg'

const route = useRoute()
const router = useRouter()
const itemsStore = useItemsStore()
const { items } = storeToRefs(itemsStore)
const { toast, showToast, runUndo } = useToast()

const itemId = route.params.id
const item = computed(() => items.value.find((entry) => entry.id === itemId))

// 用品不存在時回到我的用品。
watch(item, (current) => {
  if (!current) router.replace({ name: 'inventory' })
}, { immediate: true })

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace({ name: 'item-detail', params: { id: itemId } })
}

function onRecordEdited({ message, snapshot }) {
  showToast(message, () => itemsStore.restoreItem(snapshot))
}
</script>

<template>
  <div v-if="item" class="item-records-page">
    <header class="app-bar">
      <button type="button" class="icon-button" aria-label="返回" @click="goBack">
        <img :src="backIcon" alt="" />
      </button>
      <h1>補貨紀錄</h1>
      <span aria-hidden="true" />
    </header>

    <div class="records-heading">
      <h2>{{ item.name }}</h2>
      <span>共 {{ item.restockRecords.length }} 筆</span>
    </div>

    <RestockRecordList :item="item" @edited="onRecordEdited" />
    <p v-if="item.restockRecords.length" class="records-hint">點選一筆紀錄，可修改補貨日期與數量</p>

    <AppToast :toast="toast" @undo="runUndo" />
  </div>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.item-records-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding: t.$space-16 0 104px;
  display: flex;
  flex-direction: column;
  gap: t.$space-12;
  color: t.$text-main;
  font-family: t.$font-family;
  text-align: left;
}
.app-bar {
  margin-bottom: t.$space-4;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: t.$font-weight-bold #{t.$font-size-app-bar}/#{t.$line-height-app-bar} t.$font-family; }
}
.icon-button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 22px;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  cursor: pointer;
  img { display: block; }
  &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
}
.records-heading {
  padding: 0 t.$space-4;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: t.$space-12;
  h2 { margin: 0; min-width: 0; overflow-wrap: anywhere; font: t.$font-weight-bold 16px / 22px t.$font-family; }
  span { flex-shrink: 0; color: t.$text-sub; font: t.$font-weight-regular 13px / 22px t.$font-family; }
}
.records-hint { margin: 0; padding: 0 t.$space-4; color: t.$text-sub; font: t.$font-weight-regular 12px / 18px t.$font-family; }
</style>
