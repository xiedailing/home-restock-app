import { CATEGORIES } from './item'

// 預設用品選擇器與分類管理共用；iconKey 表示所選用品種類。
export const PRESET_ITEMS = Object.freeze([
  { iconKey: 'trash-bags', name: '垃圾袋', category: '生活日用品', unit: '包' },
  { iconKey: 'tissues', name: '衛生紙', category: '生活日用品', unit: '包' },
  { iconKey: 'light-bulb', name: '燈泡', category: '生活日用品', unit: '個' },
  { iconKey: 'laundry-detergent', name: '洗衣精', category: '洗衣', unit: '瓶' },
  { iconKey: 'dish-soap', name: '洗碗精', category: '廚房', unit: '瓶' },
  { iconKey: 'cotton-pads', name: '化妝棉', category: '個人護理', unit: '包' },
  { iconKey: 'sanitary-pads', name: '衛生棉', category: '個人護理', unit: '包' },
  { iconKey: 'rubbing-alcohol', name: '酒精', category: '清潔', unit: '瓶' },
  { iconKey: 'sponge', name: '海綿', category: '清潔', unit: '個' },
  { iconKey: 'dog-food', name: '狗狗糧食', category: '寵物用品', unit: '包' },
])
export const SYSTEM_CATEGORIES = Object.freeze([...CATEGORIES])
export function getItemCategory(item) {
  return item.category || PRESET_ITEMS.find(preset => preset.iconKey === item.iconKey)?.category || null
}
