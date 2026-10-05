<!-- src/components/BottomNav.vue -->
<script setup>
const emit = defineEmits(['click-plus'])
</script>

<template>
  <nav class="bottom-nav-wrapper fixed-bottom mx-auto">
    <div class="bottom-nav d-flex justify-content-around align-items-center bg-white rounded-pill shadow-sm px-2 py-2">
      <!-- 1. 首頁 -->
      <RouterLink
        class="nav-btn d-flex flex-column align-items-center border-0 text-decoration-none"
        :to="{ name: 'home' }"
        exact-active-class="active"
      >
        <i class="bi bi-house-door fs-5"></i>
        <span class="nav-text">首頁</span>
      </RouterLink>

      <!-- 2. 我的用品 -->
      <RouterLink
        class="nav-btn d-flex flex-column align-items-center border-0 text-decoration-none"
        :to="{ name: 'inventory' }"
        exact-active-class="active"
      >
        <i class="bi bi-box-seam fs-5"></i>
        <span class="nav-text">我的用品</span>
      </RouterLink>

      <!-- 3. 中央深綠色 Floating + 號按鈕 -->
      <button 
        class="plus-btn btn rounded-circle d-flex align-items-center justify-content-center text-white shadow"
        @click="emit('click-plus')"
      >
        <i class="bi bi-plus-lg fs-4"></i>
      </button>

      <!-- 4. 購買清單 -->
      <RouterLink
        class="nav-btn d-flex flex-column align-items-center border-0 text-decoration-none"
        :to="{ name: 'shopping' }"
        exact-active-class="active"
      >
        <i class="bi bi-receipt fs-5"></i>
        <span class="nav-text">購買清單</span>
      </RouterLink>

      <!-- 5. 設定 -->
      <RouterLink
        class="nav-btn d-flex flex-column align-items-center border-0 text-decoration-none"
        :to="{ name: 'settings' }"
        exact-active-class="active"
      >
        <i class="bi bi-gear fs-5"></i>
        <span class="nav-text">設定</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.bottom-nav-wrapper {
  max-width: 410px;
  bottom: 20px;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 0 16px;
}

.bottom-nav {
  height: 64px;
}

.nav-btn {
  color: var(--text-sub);
  font-size: 11px;
  padding: 6px 12px;
  border-radius: 20px;
  transition: all 0.2s ease;
}

.nav-btn.active {
  color: var(--primary-green);
  background-color: var(--active-green); /* 亮綠底 Accent */
  font-weight: 600;
}

.plus-btn {
  width: 52px;
  height: 52px;
  background-color: var(--primary-green);
  border: 3px solid #FFFFFF;
  margin-top: -22px; /* 懸浮向上效果 */
}

.plus-btn:active {
  transform: scale(0.95);
}
</style>
