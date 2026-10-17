// 補貨頁暫存（specs/009 FR-908、UT-23）：只活在這次執行期間，不寫入 localStorage。
// 從補貨頁去「用品管理」或「新增用品」再返回時，已選用品、數量、日期、空間、類別要還原；
// 按返回鍵離開或記錄成功則清空。
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useRestockDraftStore = defineStore('restockDraft', () => {
  // [{ id, quantity }]，id 是全域用品 id（改名後仍對得上，UT-18）。
  const selected = ref([])
  const date = ref(null)
  // 存暫存的日期；隔天才返回時，補貨日期重設為今天。
  const savedOn = ref(null)
  const spaceId = ref(null)
  const category = ref(null)
  // 只有離開去用品管理／新增用品時為 true，補貨頁回來才還原。
  const keep = ref(false)

  function reset() {
    selected.value = []
    date.value = null
    savedOn.value = null
    spaceId.value = null
    category.value = null
    keep.value = false
  }

  function save(state, today) {
    selected.value = state.selected.map(({ id, quantity }) => ({ id, quantity }))
    date.value = state.date
    savedOn.value = today
    spaceId.value = state.spaceId
    category.value = state.category
    keep.value = true
  }

  return { selected, date, savedOn, spaceId, category, keep, reset, save }
})
