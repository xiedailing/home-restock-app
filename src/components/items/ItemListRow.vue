<script setup>
import { computed } from 'vue'
import { STATUS_LABELS } from '../../models/item'
import { getItemIcon } from '../../assets/household-icons-by-state/index.js'
import chevronIcon from '../../assets/settings/chevron.svg'

const props = defineProps({
  item: { type: Object, required: true },
  spaces: { type: Array, required: true },
})

const spaceName = computed(() =>
  props.spaces.find((space) => space.id === props.item.spaceId)?.name ?? '未指定空間',
)
</script>

<template>
  <li class="item-row" :class="`item-row--${item.status}`">
    <span class="item-icon-circle" aria-hidden="true">
      <img class="item-icon" :src="getItemIcon(item.iconKey, item.status)" alt="" />
    </span>
    <div class="item-body">
      <p class="item-name">{{ item.name }}</p>
      <p class="item-meta">
        <span class="item-space">{{ spaceName }}</span>
        <template v-if="item.category">
          <span class="meta-separator">・</span>
          <span class="item-category">{{ item.category }}</span>
        </template>
      </p>
    </div>
    <div class="item-trailing">
      <span class="status-badge">{{ STATUS_LABELS[item.status] ?? '狀態未知' }}</span>
      <img class="item-chevron" :src="chevronIcon" alt="" />
    </div>
  </li>
</template>

<style scoped lang="scss">
@use '../../assets/scss/tokens' as t;

.item-row {
  --badge-bg: #{t.$success-subtle};
  --badge-text: #{t.$success};
  --icon-bg: #{t.$success-subtle};
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 96px;
  padding: 12px 12px 12px 18px;
  &:not(:last-child)::after { content: ''; position: absolute; inset: auto 0 0; height: 1px; background: t.$border-color; }
}

.item-row--overdue { --badge-bg: #fde3df; --badge-text: #{t.$danger}; --icon-bg: #f6c4bc; }
.item-row--dueSoon { --badge-bg: #ffebd7; --badge-text: #{t.$accent-text}; --icon-bg: #ffdec0; }
.item-row--inShoppingList { --badge-bg: #{t.$primary-subtle}; --badge-text: #{t.$primary-green}; --icon-bg: #{t.$primary-subtle}; }
.item-row--reminderOff { --badge-bg: #f5f5f6; --badge-text: #{t.$text-body}; --icon-bg: #f5f5f6; }

.item-icon-circle {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: t.$radius-pill;
  background: var(--icon-bg);
  box-shadow: inset -2.308px -2.308px 4.615px rgba(255, 255, 255, .9), inset 2.308px 2.308px 4.615px rgba(184, 131, 90, .22);
}

.item-icon { display: block; width: 48px; height: 48px; object-fit: contain; }
.item-body { flex: 1; min-width: 0; }

.item-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  margin: 0 0 5px;
  color: t.$text-main;
  font-size: 17px;
  font-weight: t.$font-weight-medium;
  line-height: 24px;
}

.item-meta { display: flex; min-width: 0; overflow: hidden; margin: 0; color: t.$text-sub; font-size: t.$font-size-body-sm; line-height: 18px; white-space: nowrap; }
.item-space { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.meta-separator { flex-shrink: 0; }
.item-category { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.item-trailing { display: flex; align-items: center; gap: t.$space-8; flex-shrink: 0; }

.status-badge {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: t.$radius-pill;
  background: var(--badge-bg);
  color: var(--badge-text);
  font-size: t.$font-size-caption;
  font-weight: t.$font-weight-medium;
  line-height: 18px;
  white-space: nowrap;
}

.item-chevron { flex: 0 0 16px; width: 16px; height: 16px; }
</style>
