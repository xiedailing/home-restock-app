<!-- <script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <HelloWorld />
</template> -->

<!-- src/App.vue -->
<script setup>
import BottomNav from './components/BottomNav.vue'
import ComponentsTest from './components/ComponentsTest.vue'

const handlePlusClick = () => {
  alert('點擊了中央新增按鈕！')
}
</script>

<template>
  <ComponentsTest />


  <div class="app-container">
    <!-- 主內容呈現區 -->
    <main class="p-4">
      <RouterView />
    </main>

    <!-- 共用底部導覽列 -->
    <BottomNav 
      @click-plus="handlePlusClick" 
    />
  </div>
</template>

<style scoped>
.app-container {
  padding-bottom: 120px;
}
</style>
