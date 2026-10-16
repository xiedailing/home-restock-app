<script setup>
// 各分頁標題左側的 logo；點一下彈一下（麻糬 squash & stretch），動畫中再點不重播。
import { ref } from 'vue'
import logoIcon from '../assets/logo.svg'

const bouncing = ref(false)
</script>

<template>
  <img class="brand-logo" :class="{ 'is-bouncing': bouncing }" :src="logoIcon" alt="" @click="bouncing = true" @animationend="bouncing = false" />
</template>

<style scoped>
.brand-logo {
  display: block;
  width: 43px;
  height: 32px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transform-origin: 50% 100%; /* 以底部為支點，像黏在地上彈 */
}
.brand-logo.is-bouncing { animation: mochi-bounce .7s both; }
@keyframes mochi-bounce {
  0%   { transform: scale(1, 1); }
  20%  { transform: scale(1.15, .82); }                 /* 壓扁 */
  45%  { transform: translateY(-5px) scale(.92, 1.1); } /* 彈起拉長 */
  65%  { transform: scale(1.06, .95); }                 /* 落地回彈 */
  82%  { transform: scale(.98, 1.02); }
  100% { transform: scale(1, 1); }
}
@media (prefers-reduced-motion: reduce) {
  .brand-logo.is-bouncing { animation: none; }
}
</style>
