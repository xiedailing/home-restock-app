<!-- <script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <HelloWorld />
</template> -->

<!-- src/App.vue -->
<script setup>
import { ref } from 'vue'
import BottomNav from './components/BottomNav.vue'

// 預設當前分頁為「我的用品」
const currentTab = ref('inventory')

const handlePlusClick = () => {
  alert('點擊了中央新增按鈕！')
}
</script>

<template>
  <div class="app-container">
    <!-- 主內容呈現區 -->
    <main class="p-4">
      <h3 class="fw-bold mb-3">用品管理</h3>
      <div class="bg-white p-3 rounded-4 shadow-sm mb-3">
        <p class="m-0 text-muted">目前選取的標籤頁面：<strong>{{ currentTab }}</strong></p>
      </div>
    </main>

    <!-- 共用底部導覽列 -->
    <BottomNav 
      v-model:activeTab="currentTab" 
      @click-plus="handlePlusClick" 
    />
  </div>
</template>