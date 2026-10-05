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
  <div class="app-container">
    <ComponentsTest />
    <!-- 主內容呈現區 -->
    <main class="app-content">
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
  padding: 0 16px 34px;
}

.app-content {
  /* 導覽列高 82px，加上內容與導覽列間距 24px。 */
  padding-bottom: 106px;
}
</style>
