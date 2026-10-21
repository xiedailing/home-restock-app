<script setup>
import AppToast from '../components/AppToast.vue'
import { useToast } from '../composables/useToast'
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatNameCount, limitSpaceName } from '../models/space'
import { useItemsStore } from '../stores/items'
import InviteMemberSheet from '../components/InviteMemberSheet.vue'
import SpaceColorPicker from '../components/SpaceColorPicker.vue'
import backIcon from '../assets/add-item/back-chevron.svg'
import SwitchTrack from '../components/SwitchTrack.vue'
import { DEFAULT_SPACE_ID } from '../models/item'
import { defaultAvatar, avatarOptions } from '../assets/household-icons-by-state/avatars/index.js'

const route = useRoute()
const router = useRouter()
const store = useItemsStore()
const backTarget = computed(() => ({ name: 'settings', query: { restoreView: 'spaces' } }))
const space = computed(() => store.getSpace(route.params.spaceId))
// 其他成員實際加入後才鎖定共用；只有自己時仍可切回私人。
const otherMembers = computed(() => space.value?.members || [])
const memberCount = computed(() => 1 + otherMembers.value.length)
const membersExpanded = ref(false)
const spaceMembers = computed(() => store.getSpaceMembers(route.params.spaceId))
const collapsibleMembers = computed(() => spaceMembers.value.length > 4)
const visibleMembers = computed(() => collapsibleMembers.value && !membersExpanded.value
  ? spaceMembers.value.slice(0, 3) : spaceMembers.value)
const avatarPreviewDialog = ref(null)
const avatarPreviewMember = ref(null)
function openMemberAvatar(member) {
  avatarPreviewMember.value = member
  avatarPreviewDialog.value?.showModal()
}
function closeAvatarOnBackdrop(event) {
  if (event.target !== avatarPreviewDialog.value) return
  const box = event.currentTarget.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.currentTarget.close()
}
function memberAvatar(member) {
  if (member.avatar) return member.avatar
  if (member.id === 'self') return defaultAvatar
  const index = Array.from(member.id).reduce((total, char) => total + char.codePointAt(0), 0) % avatarOptions.length
  return avatarOptions[index].image
}
const sharedLocked = computed(() => !!space.value?.shared && memberCount.value > 1)
const isOwner = computed(() => space.value?.ownerId === 'self')
const canEditSpace = computed(() => !!space.value && (space.value.shared || isOwner.value))
const isDefaultSpace = computed(() => space.value?.id === DEFAULT_SPACE_ID)
const color = computed({
  get: () => space.value?.color || 'green',
  set: value => { store.updateSpace(route.params.spaceId, { color: value }); showColorToast() },
})
const nameInput = ref(null)
const editingName = ref(false)
const leaveDialog = ref(null)
const draftName = ref('')
const nameEnterCount = ref(0)
const originalName = ref('')
const notice = ref('')
const inviteSheetOpen = ref(false)
let inviteEntryTimer
onMounted(async () => {
  if (route.query.invite !== '1') return
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
  inviteEntryTimer = setTimeout(() => {
    if (space.value?.shared && memberCount.value < 10) inviteSheetOpen.value = true
  }, delay)
  const { invite, ...query } = route.query
  await router.replace({ path: route.path, query, hash: route.hash })
})
const { toast: colorToast, showToast: showColorNotice } = useToast({ duration: 8000, pauseOnInteraction: true })
const nameLimitExceeded = computed(() => limitSpaceName(draftName.value.trim()) !== draftName.value.trim())
const nameCountHint = computed(() => formatNameCount(draftName.value))
function updateNameInput(event) {
  // 組字期間保留輸入法內容，選字完成後移除所有空白。
  if (event.isComposing) return
  const input = event.target
  const cursor = input.selectionStart
  const value = input.value.replace(/\s/g, '')
  const nextCursor = input.value.slice(0, cursor).replace(/\s/g, '').length
  input.value = value
  draftName.value = value
  input.setSelectionRange(nextCursor, nextCursor)
}

function showColorToast(message = '空間代表色已更新') {
  showColorNotice(message)
}
onBeforeUnmount(() => { clearTimeout(inviteEntryTimer) })
async function editName() {
  if (!canEditSpace.value) return
  draftName.value = space.value.name
  nameEnterCount.value = 0
  originalName.value = space.value.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}
function clearDraftName() {
  draftName.value = ''
  nameEnterCount.value = 0
  nameInput.value?.focus()
}
function handleNameEnter(event) {
  // 中文輸入法選字與長按 Enter 不算確認。
  if (event.isComposing || event.keyCode === 229 || event.repeat) return
  nameEnterCount.value += 1
  if (nameEnterCount.value >= 2) saveName(event)
}
function toggleShared() {
  if (sharedLocked.value || isDefaultSpace.value) return
  const shared = !space.value.shared
  store.updateSpace(route.params.spaceId, { shared })
  showColorToast(shared ? '多人共享已開啟' : '多人共享已關閉')
}
const nameDuplicate = computed(() => !!draftName.value.trim() && store.hasSpaceName(draftName.value, route.params.spaceId))
function saveName(event) {
  if (!editingName.value || event?.isComposing) return
  if (event?.type === 'focusout' && event.relatedTarget?.closest('.name-input-wrapper')) return
  if (nameLimitExceeded.value || nameDuplicate.value) return
  if (draftName.value.trim() && draftName.value.trim() !== space.value.name) {
    store.updateSpace(route.params.spaceId, { name: draftName.value })
    showColorToast('空間名稱已更新')
  }
  editingName.value = false
}
async function openLeaveDialog() {
  leaveDialog.value.showModal()
  await nextTick()
  // 初始焦點放在對話框，避免取消按鈕一開啟就顯示綠框。
  leaveDialog.value.focus()
}
function confirmLeave() {
  const name = space.value?.name
  if (!store.leaveSpace(route.params.spaceId)) return
  leaveDialog.value.close()
  router.push({ name: 'settings', query: { spaceLeft: name } })
}
</script>

<template>
  <section class="edit-space-page">
    <header class="space-header">
      <RouterLink :to="backTarget" class="back-button" :aria-label="backTarget.name === 'settings' ? '返回設定' : '返回空間管理'"><img :src="backIcon" alt="" /></RouterLink>
      <h1>{{ space?.name || '編輯空間' }}</h1>
      <button v-if="space && space.id !== DEFAULT_SPACE_ID" type="button" class="leave-button" aria-label="退出空間" @click="openLeaveDialog">
        <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
      </button>
      <span v-else />
    </header>
    <template v-if="space">
      <h2>空間資訊</h2>
      <div class="space-card">
        <div class="info-row name-row">
          <div class="name-main-row">
          <label v-if="editingName" for="space-name-input">空間名稱</label>
          <span v-else>空間名稱</span>
          <div v-if="editingName" class="name-input-wrapper" @focusout="saveName">
            <input id="space-name-input" ref="nameInput" v-model="draftName"
              class="name-input" :aria-invalid="nameLimitExceeded" :class="{ 'limit-exceeded': nameLimitExceeded }" :placeholder="originalName"
              @input="nameEnterCount = 0; updateNameInput($event)" @compositionend="updateNameInput" @keydown.space="!$event.isComposing && $event.keyCode !== 229 && $event.preventDefault()" @keydown.enter.prevent="handleNameEnter" @keydown.esc.prevent="editingName = false" />
            <span class="name-count-value">{{ nameCountHint }}</span>
            <p v-if="nameDuplicate" class="name-length-error">已有相同名稱的空間，請使用其他名稱。</p>
            <p v-if="nameLimitExceeded" class="name-length-error">名稱過長，請縮短。</p>
            <button type="button" class="clear-name-button" aria-label="清除空間名稱"
              @mousedown.prevent @click="clearDraftName">
              <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <template v-else>
            <strong>{{ space.name }}</strong>
            <button v-if="canEditSpace" type="button" class="name-edit-button" aria-label="修改空間名稱" @click="editName">
              <i class="fa-solid fa-pencil name-edit-icon" aria-hidden="true"></i>
            </button>
          </template>
          </div>
          <div class="name-hint-collapse" :class="{ expanded: editingName && space.shared }" :aria-hidden="!(editingName && space.shared)">
            <div class="name-hint-content">
              <p class="name-count">此名稱會同步顯示給其他成員</p>
            </div>
          </div>
        </div>
        <div class="info-row usage-row">
          <span id="space-usage-label">多人共享</span>
          <strong v-if="isDefaultSpace" class="disabled-value">-</strong>
          <button v-if="!isDefaultSpace" type="button" class="usage-switch" role="switch" :aria-checked="space.shared" :disabled="sharedLocked || !isOwner"
            aria-labelledby="space-usage-label" @click="toggleShared">
            <SwitchTrack :checked="space.shared" :disabled="sharedLocked || !isOwner" />
          </button>
        </div>
        <div class="info-row">
          <span>成員人數</span>
          <small v-if="space.shared && memberCount >= 10" class="member-limit-tag">已達上限</small>
          <strong :class="{ 'disabled-value': !space.shared }">{{ space.shared ? `${memberCount} / 10` : '1人' }}</strong>
        </div>
        <fieldset class="color-field"><legend>空間代表色</legend><SpaceColorPicker v-if="canEditSpace" v-model="color" /></fieldset>
      </div>
      <h2>成員</h2>
      <div class="space-card members-card">
        <div v-for="member in visibleMembers" :key="member.id" class="info-row member-row">
          <button type="button" class="member-avatar-button" :aria-label="`放大${member.name}的頭貼`" aria-haspopup="dialog" @click="openMemberAvatar(member)"><img class="member-avatar" :src="memberAvatar(member)" alt="" /></button>
          <span>{{ member.name }}{{ member.id === 'self' ? '（你）' : '' }}</span>
        </div>
        <button v-if="collapsibleMembers" type="button" class="members-toggle" :aria-expanded="membersExpanded" @click="membersExpanded = !membersExpanded">
          {{ membersExpanded ? '收合成員' : `展開其餘 ${spaceMembers.length - 3} 人` }}
          <i class="fa-solid" :class="membersExpanded ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true"></i>
        </button>
        <button v-if="space.shared" type="button" class="invite-button" :disabled="memberCount >= 10" @click="inviteSheetOpen = true">邀請成員</button>
        <p v-else class="private-space-hint">此為個人專屬空間，無法邀請其他成員加入</p>
      </div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </template>
    <p v-else>找不到此空間，請返回空間管理。</p>
    <InviteMemberSheet hide-close-button :open="inviteSheetOpen" :space="space" @close="inviteSheetOpen = false" @copied="showColorToast" />
    <AppToast :toast="colorToast" />
    <dialog ref="avatarPreviewDialog" class="member-avatar-dialog" aria-labelledby="member-avatar-preview-title" @click="closeAvatarOnBackdrop" @close="avatarPreviewMember = null">
      <template v-if="avatarPreviewMember">
        <header class="member-avatar-preview-header">
          <h2 id="member-avatar-preview-title">{{ avatarPreviewMember.name }}的頭貼</h2>
          <button type="button" class="member-avatar-preview-close" aria-label="關閉頭貼預覽" autofocus @click="avatarPreviewDialog.close()">×</button>
        </header>
        <img class="member-avatar-large" :src="memberAvatar(avatarPreviewMember)" :alt="`${avatarPreviewMember.name}的頭貼`" />
      </template>
    </dialog>
    <dialog ref="leaveDialog" tabindex="-1" class="leave-dialog" aria-labelledby="leave-dialog-title" aria-describedby="leave-dialog-message">
      <form v-if="space" @submit.prevent="confirmLeave">
        <h2 id="leave-dialog-title">退出空間？</h2>
        <p id="leave-dialog-message">你確定要退出「{{ space.name }}」空間嗎？
          <br />
          <template v-if="otherMembers.length">退出後將無法查看此空間內容，需重新受邀才能加入。</template>
          <template v-else>你是唯一成員，退出後此空間與所有資料將永久刪除。</template>
        </p>
        <div class="leave-actions">
          <button type="button" class="btn btn-secondary" @click="leaveDialog.close()">取消</button>
          <button type="submit" class="btn btn-danger">退出</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped lang="scss">
@use '../assets/scss/tokens' as t;
@use '../assets/scss/space-layout' as layout;
.members-toggle { width: 100%; display: flex; align-items: center; justify-content: center; gap: t.$space-8; margin-bottom: t.$space-12; padding: t.$space-8; border: 0; background: transparent; color: t.$text-sub; font: 400 t.$font-size-caption t.$font-family; }
.name-count-value { position: absolute; right: 36px; top: 18px; transform: translateY(-50%); color: t.$text-disabled; font-size: t.$font-size-caption; white-space: nowrap; pointer-events: none; }
.edit-space-page { max-width: 358px; width: 100%; margin-inline: auto; padding-top: 16px; display: flex; flex-direction: column; gap: 16px; text-align: left; color: t.$text-main; font-family: t.$font-family; }
.space-header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; h1 { margin: 0; text-align: center; font: 700 17px / 24px t.$font-family; } }
.back-button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: t.$input-bg; box-shadow: t.$shadow-raised; img { width: 24px; height: 24px; } }
h2 { margin: 0; color: #292624; font: 700 16px / 22px t.$font-family; }
.space-card + h2 { margin-top: 15px; }
.space-card { padding: t.$space-16; border: 1px solid rgba(237,234,227,.4); border-radius: t.$radius-card; background: t.$card-bg; box-shadow: t.$shadow-card; overflow: hidden; }
.info-row { display: flex; align-items: center; gap: t.$space-8; width: 100%; @include layout.row(60px, t.$space-16); color: t.$text-body; font: 400 14px / 20px t.$font-family; > span { flex: 1; } strong { font-weight: 500; color: t.$text-main; } img { width: 20px; height: 20px; } }
.name-row { flex-wrap: wrap; column-gap: t.$space-8; row-gap: 0; background: transparent; border: 0; @include layout.divider; text-align: left; }
.name-main-row { display: flex; align-items: flex-start; gap: t.$space-8; width: 100%; min-height: 36px; }
.name-main-row > label, .name-main-row > span { flex: 1; display: flex; align-items: center; height: 36px; white-space: nowrap; }
.name-main-row > strong, .name-main-row > .name-edit-button { min-height: 36px; display: flex; align-items: center; }
.name-hint-collapse { flex-basis: 100%; display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .5s ease, opacity .5s ease; &.expanded { grid-template-rows: 1fr; opacity: 1; } }
.name-hint-content { min-height: 0; overflow: hidden; }
.name-hint-content .name-count { width: 196px; max-width: 65%; margin-left: auto; }
@media (prefers-reduced-motion: reduce) { .name-hint-collapse { transition: none; } }
.name-input-wrapper { position: relative; width: 196px; max-width: 65%; min-width: 0; }
.clear-name-button { position: absolute; right: t.$space-12; top: 18px; transform: translateY(-50%); padding: 0; border: 0; background: transparent; color: t.$text-disabled; font-size: 16px; line-height: 1; }
.name-input { width: 100%; max-width: 100%; min-width: 0; height: 36px; padding: 0 76px 0 12px; border: 0; border-radius: t.$radius-input; background: t.$input-bg; box-shadow: t.$shadow-inset; color: t.$text-main; font: 400 15px / 21px t.$font-family; &::placeholder { color: t.$text-disabled; } &:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; } }
.name-length-error { margin: 4px 0 0; color: t.$accent-text; font-size: t.$font-size-caption; }
.name-count { margin: 6px 0 0; color: t.$text-disabled; font-size: t.$font-size-caption; }
.name-edit-button { padding: 0; border: 0; background: transparent; display: grid; place-items: center; }
.name-edit-icon { display: inline-grid; place-items: center; width: 20px; height: 20px; color: t.$text-disabled; font-size: 16px; flex-shrink: 0; }
.info-row strong.disabled-value { color: t.$text-disabled; }
.usage-row { gap: 8px; @include layout.divider; }
.usage-switch {
  &:disabled { cursor: not-allowed; }
  flex: 0 0 t.$switch-width;
  width: t.$switch-width;
  height: t.$switch-height;
  padding: 0;
  border: 0;
  border-radius: t.$switch-radius;
  background: transparent;
}
.color-field {
  position: relative;
  min-width: 0;
  // 延伸到卡片右側，讓第五個灰色選項露出一部分作為滑動提示。
  width: calc(100% + 16px);
  margin: 0 -16px 0 0;
  padding: t.$space-12 0 0 t.$space-16;
  border: 0;
  // 選色區延伸寬度，但分隔線仍與空間名稱列的左右邊界一致。
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 16px;
    height: 1px;
    background: t.$border-color;
  }
  legend { float: left; width: 100%; margin: 0 0 t.$space-8; font: 400 14px / 20px t.$font-family; color: t.$text-body; }
}
.members-card { .info-row { @include layout.divider; } }
.member-row { gap: t.$space-12; }
.member-row .member-avatar { width: 32px; height: 32px; flex-shrink: 0; object-fit: cover; border-radius: 50%; background: t.$active-green; }
.members-card .info-row + .invite-button { margin-top: t.$space-16; }
.private-space-hint { margin: t.$space-16 0 0; color: t.$text-sub; font-size: t.$font-size-caption; line-height: t.$line-height-body; font-family: t.$font-family; font-weight: 400; }
.invite-button { width: 100%; min-height: 48px; border: 0; border-radius: t.$radius-pill; background: #ecf4ea; color: #3c763c; font: 700 16px / 22px t.$font-family; }
.invite-button:disabled {
  background: t.$border-color;
  color: t.$text-disabled;
  cursor: not-allowed;
}
.notice { margin: 0; color: t.$text-sub; font-size: 12px; }
.member-limit-tag {
  padding: 2px 6px;
  margin-right: t.$space-4;
  border-radius: t.$radius-pill;
  // Figma color/feedback/error-subtle；僅套用此標籤，不修改共用 tokens。
  background: #fce9e4;
  color: rgba(t.$danger, .7);
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
}
.color-toast {
  position: fixed;
  bottom: t.$toast-bottom;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  width: max-content;
  max-width: min(t.$toast-max-width, calc(100% - t.$toast-inset-inline * 2));
  min-height: t.$toast-min-height;
  margin: 0;
  padding: t.$toast-padding-block t.$toast-padding-inline;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: t.$space-8;
  border: 0;
  border-radius: t.$radius-pill;
  background: t.$toast-background;
  color: t.$toast-text;
  box-shadow: t.$toast-shadow;
  font-family: t.$font-family;
  font-weight: t.$font-weight-bold;
  font-size: t.$font-size-body-sm;
  line-height: t.$line-height-body;
  text-align: center;
  pointer-events: none;
  i { color: t.$toast-success-accent; flex-shrink: 0; }
}
.color-toast-leave-active { transition: opacity .5s ease; }
.color-toast-leave-to { opacity: 0; }
.leave-button { width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: t.$text-sub; font-size: 20px; display: grid; place-items: center; }
.leave-dialog:focus { outline: none; }
.leave-dialog {
  width: min(300px, calc(100% - t.$space-16 * 2));
  margin: auto;
  max-height: calc(100dvh - t.$space-16 * 2);
  padding: t.$space-24 18px;
  border: 0;
  border-radius: t.$radius-card;
  background: t.$card-bg;
  color: t.$text-main;
  box-shadow: 0 14px 16px rgba(140, 136, 127, .2);
  text-align: center;
  &::backdrop { background: rgba(t.$text-main, .35); }
  &:focus { outline: none; }
  h2 { margin: 0 0 t.$space-8; font: t.$font-weight-bold #{t.$font-size-card-title} / 1.45 t.$font-family; overflow-wrap: anywhere; }
  p { margin: 0; color: t.$text-sub; font: t.$font-weight-regular #{t.$font-size-body} / 1.45 t.$font-family; overflow-wrap: anywhere; }
}
.leave-actions { display: flex; gap: 12px; button { flex: 1; min-height: 48px; } }
button { cursor: pointer; }
button:focus-visible, a:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.color-field :deep(.color-picker) { display: flex; flex-direction: column; }
.color-field :deep(.color-hint) { display: none; }
.leave-dialog .leave-actions { display: flex; gap: t.$space-12; margin-top: t.$space-32; }
.leave-dialog .leave-actions .btn { flex: 1; min-width: 0; height: t.$button-height; min-height: t.$button-height; padding: 0 t.$space-24; border: 0; border-radius: t.$radius-pill; font: t.$font-weight-medium #{t.$font-size-body} / normal t.$font-family; }
.leave-dialog .leave-actions .btn-secondary { background: t.$input-bg; color: t.$text-button-secondary; box-shadow: t.$shadow-raised; }
.leave-dialog .leave-actions button:focus { outline: none; }
.leave-dialog .leave-actions button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 2px; }
.name-length-error {
  margin-block: t.$space-12;
  box-sizing: border-box;
  padding: t.$space-8 t.$space-12;
  border-radius: t.$radius-md;
  background: t.$accent-soft;
  color: t.$accent-text;
  font: t.$font-weight-regular #{t.$font-size-metadata} / normal t.$font-family;
  text-align: left;
}
.name-row .name-length-error { margin-bottom: 0; }
.leave-dialog .leave-actions .btn-secondary:focus, .leave-dialog .leave-actions .btn-secondary:focus-visible { outline: none; }
header h1 { letter-spacing: .5px; }


.member-avatar-button { position: relative; display: block; flex: 0 0 32px; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.member-avatar-button::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; }
.member-avatar-button .member-avatar { display: block; }
.member-avatar-button:focus-visible { outline: 2px solid t.$primary-green; outline-offset: 4px; }
.member-avatar-dialog { box-sizing: border-box; width: min(320px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: t.$space-24; border: 0; border-radius: t.$radius-card; background: t.$card-bg; color: t.$text-main; font-family: t.$font-family; box-shadow: t.$shadow-card; }
.member-avatar-dialog::backdrop { background: rgba(29, 29, 31, .4); }
.member-avatar-preview-header { display: flex; align-items: center; justify-content: space-between; gap: t.$space-12; margin-bottom: t.$space-16; min-height: 32px; }
.member-avatar-preview-header h2 { margin: 0; min-width: 0; overflow-wrap: anywhere; font: t.$font-weight-bold #{t.$font-size-button} / 24px t.$font-family; }
.member-avatar-preview-close { flex: 0 0 32px; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: t.$input-bg; color: t.$text-body; font: 24px / 32px t.$font-family; cursor: pointer; }
.member-avatar-large { display: block; width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: t.$radius-input; background: t.$active-green; }
</style>
