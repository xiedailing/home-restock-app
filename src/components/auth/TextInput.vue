<script setup>
const model = defineModel({ type: String, default: '' })
</script>
<template><input v-model="model" class="auth-input" /></template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.auth-input { width: 100%; box-sizing: border-box; height: 44px; border: 1px solid t.$border-color; border-radius: t.$radius-input; padding: 12px 16px; background: t.$input-bg; color: t.$text-main; box-shadow: t.$shadow-inset; font: t.$font-weight-regular #{t.$font-size-body} / 20px t.$font-family; &::placeholder { color: t.$text-disabled; } &:focus { outline: 1.5px solid t.$primary-green; outline-offset: 0; } }
</style>
