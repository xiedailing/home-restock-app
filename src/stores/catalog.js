// 全域用品選項，獨立於空間用品與補貨紀錄（FR-904、FR-909）。
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { PRESET_ITEMS } from '../models/itemCategories.js'
import { generateId } from '../utils/id.js'
import { createDebouncedSaver, loadPersisted, savePersisted, STORE_KEYS } from '../utils/persist.js'

const normalizeName = name => typeof name === 'string' ? name.trim().toLowerCase() : ''
// 不存檔、不隨篩選重排，ID 在重新載入後維持相同。
const presetItems = Object.freeze(PRESET_ITEMS.map(item => Object.freeze({
  ...item, id: `preset:${item.iconKey}`, iconPhoto: null, iconManual: false,
})))

export const useCatalogStore = defineStore('catalog', () => {
  const saved = loadPersisted(STORE_KEYS.catalog)
  const validItem = item => item && typeof item.id === 'string' && item.id.length > 0
    && !item.id.startsWith('preset:') && normalizeName(item.name)
    && typeof item.category === 'string' && item.category.trim()
    && typeof item.unit === 'string' && item.unit.trim()
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
  const catalogItems = ref((Array.isArray(saved?.catalogItems) ? saved.catalogItems : [])
    .filter(validItem).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
  const allItems = computed(() => [...catalogItems.value, ...presetItems])
  const justAddedId = ref(null)

  function isNameTaken(name) {
    const normalized = normalizeName(name)
    return !!normalized && allItems.value.some(item => normalizeName(item.name) === normalized)
  }
  function getById(id) {
    return allItems.value.find(item => item.id === id) ?? null
  }
  function clearJustAddedId() {
    justAddedId.value = null
  }
  function addCatalogItem(input = {}) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const category = typeof input.category === 'string' ? input.category.trim() : ''
    const unit = typeof input.unit === 'string' ? input.unit.trim() : ''
    if (!name || !category || !unit || isNameTaken(name)) return null
    const item = {
      id: generateId(), name, iconKey: input.iconKey ?? null, iconPhoto: input.iconPhoto ?? null,
      iconManual: input.iconManual ?? false, category, unit, createdAt: new Date().toISOString(),
    }
    catalogItems.value.unshift(item)
    justAddedId.value = item.id
    return item
  }

  const scheduleSave = createDebouncedSaver(() => {
    savePersisted(STORE_KEYS.catalog, { catalogItems: catalogItems.value })
  })
  // 同步排入延遲存檔，讓剛新增便關頁時 pagehide 仍能沖刷最後一次變更。
  watch(catalogItems, scheduleSave, { deep: true, flush: 'sync' })

  return { catalogItems, allItems, getById, justAddedId, clearJustAddedId, isNameTaken, addCatalogItem }
})
