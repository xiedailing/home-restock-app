<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useItemsStore } from '../stores/items'
import { getSpaceColor } from '../models/space'
import chevron from '../assets/settings/chevron.svg'

const store = useItemsStore()
const route = useRoute()
const inviteCode = ref('')
const notice = ref('')
const createdNotice = computed(() => typeof route.query.spaceCreated === 'string'
  ? `已新增空間「${route.query.spaceCreated}」。` : '')
let noticeTimer
function joinSpace() {
  const result = store.joinSpaceByCode(inviteCode.value)
  notice.value = result.message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
  if (result.ok) inviteCode.value = ''
}
onBeforeUnmount(() => clearTimeout(noticeTimer))
</script>

<template>
  <section class="spaces-page" aria-labelledby="spaces-page-title">
    <header class="spaces-header">
      <RouterLink :to="{ name: 'settings' }" class="back-button" aria-label="返回設定">
        <img :src="chevron" alt="" />
      </RouterLink>
      <h1 id="spaces-page-title">空間管理</h1>
      <span aria-hidden="true" />
    </header>

    <section aria-labelledby="my-spaces-title">
      <h2 id="my-spaces-title">我的空間</h2>
      <p class="section-description">建立不同空間（如：辦公室、分租房），分門別類管理用品。</p>
      <div class="spaces-card">
        <div class="space-list">
          <RouterLink v-for="space in store.spaces" :key="space.id" class="space-row" :to="{ name: 'edit-space', params: { spaceId: space.id } }">
            <span class="space-dot" :style="{ backgroundColor: getSpaceColor(space.color).dark }" aria-hidden="true" />
            <span class="space-name">{{ space.name }}</span>
            <span v-if="space.shared" class="member-count">{{ store.getSpaceMembers(space.id).length }} 人</span>
            <img :src="chevron" alt="" />
          </RouterLink>
        </div>
        <RouterLink :to="{ name: 'add-space' }" class="add-space-link">＋ 新增空間</RouterLink>
      </div>
      <p v-if="createdNotice" class="section-hint" role="status">{{ createdNotice }}</p>
      <p v-if="route.query.spaceLeft" class="section-hint" role="status">已退出「{{ route.query.spaceLeft }}」空間。</p>
    </section>

    <section aria-labelledby="join-space-title">
      <h2 id="join-space-title">加入空間</h2>
      <p class="section-description">輸入邀請碼後即可同步共享待補清單。</p>
      <form class="spaces-card join-form" @submit.prevent="joinSpace">
        <label class="visually-hidden" for="invite-code">空間邀請碼</label>
        <input id="invite-code" v-model="inviteCode" placeholder="輸入空間邀請碼" autocomplete="off" />
        <button type="submit" class="join-button">加入</button>
      </form>
      <Teleport to="body"><p v-if="notice" class="invite-toast" role="status">{{ notice }}</p></Teleport>
    </section>

  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;

.spaces-page {
  width: 100%;
  max-width: 358px;
  margin-inline: auto;
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  color: t.$text-main;
  font-family: t.$font-family;
}
.spaces-header {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  h1 { margin: 0; text-align: center; font: 700 17px / 24px t.$font-family; }
}
.back-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: t.$input-bg;
  box-shadow: t.$shadow-raised;
  img { width: 24px; height: 24px; transform: rotate(180deg); }
}
h2 { margin: 0 0 16px; color: #292624; font: 700 16px / 22px t.$font-family; }
.spaces-card {
  padding: 16px;
  border: 1px solid rgba(237, 234, 227, .4);
  border-radius: 20px;
  background: #fbfaf6;
  box-shadow: t.$shadow-card;
}
.space-list { padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid t.$border-color; }
.space-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 48px;
  padding: 12px 8px 12px 16px;
  border: 0;
  background: transparent;
  text-align: left;
  text-decoration: none;
  color: t.$text-body;
  font: 400 14px / 20px t.$font-family;
  img { width: 16px; height: 16px; flex-shrink: 0; }
}
.space-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.space-name { flex: 1; overflow-wrap: anywhere; }
.add-space-link {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 48px;
  border-radius: t.$radius-pill;
  background: #ecf4ea;
  color: #3c763c;
  text-decoration: none;
  font: 700 16px / 22px t.$font-family;
}
h2:has(+ .section-description) { margin-bottom: t.$space-8; }
.section-description { margin: 0 0 t.$space-16; color: t.$text-sub; font-size: t.$font-size-caption; line-height: 18px; }
.section-hint { margin: 16px 0 0; color: t.$text-sub; font-size: 12px; line-height: 18px; }
.join-form {
  display: flex;
  align-items: center;
  gap: 8px;
  input {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 48px;
    padding: 4px 14px;
    border: 0;
    border-radius: t.$radius-pill;
    background: t.$input-bg;
    box-shadow: t.$shadow-inset;
    color: t.$text-main;
    font: 400 14px / 20px t.$font-family;
    &::placeholder { color: t.$text-disabled; }
  }
}
.join-button {
  flex: 0 0 64px;
  height: 36px;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$primary-green;
  color: white;
  font: 700 14px / 20px t.$font-family;
  box-shadow: -2px -2px 5px rgba(255,255,255,.9), 3px 4px 7px rgba(42,74,39,.35), inset 1px 1.5px 2px rgba(31,58,29,.28), inset -1px -1px 2px rgba(255,255,255,.22);
}
.invite-toast { position: fixed; bottom: 132px; left: 50%; transform: translateX(-50%); z-index: 1100; max-width: calc(100% - 32px); padding: 14px 24px; border: 1px solid t.$border-color; border-radius: t.$radius-pill; background: t.$card-bg; color: t.$text-main; box-shadow: t.$shadow-card; font: 700 14px / 20px t.$font-family; text-align: center; }
.member-count { color: t.$text-main; white-space: nowrap; }
button { cursor: pointer; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
</style>
