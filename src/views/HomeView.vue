<template>
  <section>
    <h1 class="h3 fw-bold mb-3">首頁</h1>
    <div class="card p-4">
      <p class="mb-3">這裡將顯示用品摘要與補貨提醒。</p>
      <div class="d-flex flex-wrap gap-3">
        <RouterLink class="btn btn-primary" :to="{ name: 'inventory' }">查看我的用品</RouterLink>
        <RouterLink class="btn btn-secondary" :to="{ name: 'shopping' }">查看購買清單</RouterLink>
      </div>
    </div>
  </section>
</template>
