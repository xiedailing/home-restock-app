<script setup>
// 保留既有元件與 to prop，讓已引用的頁首一起改為共享通知鈴鐺。
import SharedNotificationsMenu from './SharedNotificationsMenu.vue'
defineProps({ to: { type: [String, Object], default: null } })
</script>
<template><SharedNotificationsMenu /></template>
