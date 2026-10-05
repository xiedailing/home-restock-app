<template>
  <section>
    <h1 class="h3 fw-bold mb-3">購買清單</h1>
    <div class="card p-4">
      <p class="mb-3">這裡將顯示待買用品，並提供完成補貨功能。</p>
      <div>
        <RouterLink class="btn btn-secondary" :to="{ name: 'inventory' }">返回我的用品</RouterLink>
      </div>
    </div>
  </section>
</template>
