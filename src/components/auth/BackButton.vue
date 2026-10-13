<script setup>
import backIcon from '../../assets/add-item/back-chevron.svg'
</script>
<template><button type="button" class="auth-back" aria-label="返回上一步"><img :src="backIcon" alt="" /></button></template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.auth-back { position: absolute; top: 52px; left: 0; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: t.$radius-pill; background: t.$card-bg; box-shadow: t.$shadow-raised; cursor: pointer; &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; } }
</style>
