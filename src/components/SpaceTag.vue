<script setup>
import { computed } from 'vue'
import { useItemsStore } from '../stores/items'
import { getSpaceColor, formatSpaceLabel } from '../models/space'
const props = defineProps({ spaceId: { type: String, required: true } })
const store = useItemsStore()
const space = computed(() => store.getSpace(props.spaceId))
const palette = computed(() => getSpaceColor(space.value?.color))
</script>
<template>
  <span class="space-tag" :title="space?.name || '未指定空間'" :aria-label="space?.name || '未指定空間'" :style="{ backgroundColor: palette.light, color: palette.dark }">{{ space ? formatSpaceLabel(space.name) : '未指定空間' }}</span>
</template>
<style scoped>
.space-tag { display: inline-flex; align-items: center; width: fit-content; padding: 3px 10px; border-radius: 999px; font-size: 14px; font-weight: 500; line-height: 20px; }
</style>
