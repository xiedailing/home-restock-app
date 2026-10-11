<script setup>
// 首頁「最近更新」卡（specs/004 FR-408，HOME-09）。Figma：Proposal / Soft Recent Update Card（992:2）State=Empty（985:2）。
// 目前沒有成員操作紀錄，固定顯示空狀態、不可點擊；首頁寬 132，只放「尚無更新紀錄」，不放第二行說明。
import emptyIcon from '../../assets/home/recent-update-empty.svg'
</script>

<template>
  <section class="recent-card" aria-labelledby="recent-update-title">
    <img class="recent-icon" :src="emptyIcon" alt="" />
    <h2 id="recent-update-title" class="recent-title">最近更新</h2>
    <p class="recent-empty">尚無更新紀錄</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

// 尺寸與內距同首頁 693:3840（132×160）；空狀態無陰影，同待買 Items = 0。
.recent-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  height: 160px;
  padding: 18px t.$space-16;
  border: 1px solid rgba(241, 237, 230, .25);
  border-radius: 26px;
  background: #fffdfa;
  font-family: t.$font-family;
}
.recent-icon { display: block; }
.recent-title { margin: 0; color: #2b2a26; font: t.$font-weight-bold 18px / normal t.$font-family; }
.recent-empty { margin: 0; color: #8b8880; font: t.$font-weight-medium 14px / 21px t.$font-family; }
</style>
