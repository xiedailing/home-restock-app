<template>
  <section class="p-4 text-start" aria-labelledby="components-test-title">
    <h2 id="components-test-title" class="h5 mb-4">按鈕樣式測試</h2>
    <!-- 間距讓陰影完整呈現；按鈕外觀統一由 _components.scss 控制。 -->
    <div class="d-flex flex-wrap gap-4 align-items-start">
      <div>
        <p class="small text-muted mb-2">Primary · 外凸</p>
        <button type="button" class="btn btn-primary">加入清單 ＋</button>
      </div>
      <div>
        <p class="small text-muted mb-2">Secondary · 外凸</p>
        <button type="button" class="btn btn-secondary">加入清單</button>
      </div>
      <div>
        <p class="small text-muted mb-2">Added · 內凹</p>
        <button type="button" class="btn btn-added">✓ 已加入清單</button>
      </div>
      <div>
        <p class="small text-muted mb-2">Danger · 外凸</p>
        <button type="button" class="btn btn-danger">加入清單</button>
      </div>
    </div>
  </section>
</template>
