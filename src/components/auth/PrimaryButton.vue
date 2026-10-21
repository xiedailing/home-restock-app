<script setup>
defineProps({ type: { type: String, default: 'button' } })
</script>
<template><button :type="type" class="btn btn-primary auth-primary"><slot /></button></template>
<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;
.auth-primary { box-sizing: border-box; width: 100%; height: 48px; min-height: 48px; padding: 12px 24px; border: 0; border-radius: t.$radius-pill; background: t.$primary-green; color: t.$text-inverse; font: t.$font-weight-bold #{t.$font-size-button} / 24px t.$font-family; box-shadow: t.$shadow-primary; &:active { background: t.$dark-green; } @media (min-width: 1024px) and (hover: hover) and (pointer: fine) { &:hover { background: t.$dark-green; } } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 3px; } }
</style>
