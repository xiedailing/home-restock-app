<template>
  <section>
    <h1 class="h3 fw-bold mb-3">我的用品</h1>
    <div class="card p-4">
      <p class="mb-3">這裡將顯示用品列表，並提供新增與編輯功能。</p>
      <div>
        <RouterLink class="btn btn-secondary" :to="{ name: 'shopping' }">前往購買清單</RouterLink>
      </div>
    </div>
  </section>
</template>
