// 新增／編輯用品共用：只管理單位選項，不修改用品或補貨紀錄。
import { ref } from 'vue'
import { useUnitOptionsStore } from '../stores/unitOptions'
import { useToast } from './useToast'
export function useUnitManagement(onRemoved = () => {}) {
  const unitOptions = useUnitOptionsStore()
  const editingUnits = ref(false)
  const unitOptionError = ref('')
  const deleteUnitDialog = ref(null)
  const pendingUnitDeletion = ref(null)
  const { toast: unitToast, showToast, runUndo: undoUnitRemoval } = useToast()
  function requestUnitDeletion(value) {
    if (!editingUnits.value || !unitOptions.customUnits.includes(value)) return
    pendingUnitDeletion.value = value
    unitOptionError.value = ''
    deleteUnitDialog.value?.showModal()
  }
  function cancelUnitDeletion() {
    deleteUnitDialog.value?.close()
    pendingUnitDeletion.value = null
  }
  function removeCustomUnit(value) {
    const result = unitOptions.removeUnit(value)
    unitOptionError.value = result.ok ? '' : result.message
    if (result.ok) {
      onRemoved(value)
      showToast(`已刪除「${value}」單位`, () => {
        const restored = result.undo()
        if (!restored.ok) showToast(restored.message)
      })
    }
    return result
  }
  function confirmUnitDeletion() {
    if (!editingUnits.value || !pendingUnitDeletion.value) return
    if (removeCustomUnit(pendingUnitDeletion.value).ok) cancelUnitDeletion()
  }
  return { editingUnits, unitOptionError, deleteUnitDialog, pendingUnitDeletion, unitToast,
    undoUnitRemoval, requestUnitDeletion, cancelUnitDeletion, confirmUnitDeletion, removeCustomUnit }
}
