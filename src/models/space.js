// 空間代表色與標籤共用相同配色，避免各頁自行定義。
export const SPACE_COLORS = [
  { id: 'green', label: '森林綠', light: '#eef3ea', dark: '#3f6f3b' },
  { id: 'blue', label: '柔霧藍', light: '#e3ecf8', dark: '#3f5f8f' },
  { id: 'orange', label: '暖杏橘', light: '#ffebd6', dark: '#a85a10' },
  { id: 'red', label: '柔霧紫', light: '#ede5f4', dark: '#795293' },
  { id: 'gray', label: '鼠尾草灰', light: '#f6f5f1', dark: '#636c65' },
]
export function getSpaceColor(color) {
  return SPACE_COLORS.find(option => option.id === color) || SPACE_COLORS[0]
}

// 混合輸入：ASCII 字元算 1，其餘字元算 2；總額度 16。
export function limitSpaceName(value) {
  let result = ''
  let length = 0
  for (const character of value) {
    const cost = character.codePointAt(0) <= 127 ? 1 : 2
    if (length + cost > 16) break
    result += character
    length += cost
  }
  return result
}

// 名稱輸入框旁的字數提示：全英數上限 16、含中文上限 8（英數算 0.5），與 limitSpaceName 的額度一致。
export function formatNameCount(text) {
  const characters = Array.from(text)
  const asciiOnly = characters.length > 0 && characters.every(character => character.codePointAt(0) <= 127)
  const count = asciiOnly
    ? characters.length
    : characters.reduce((total, character) => total + (character.codePointAt(0) <= 127 ? 0.5 : 1), 0)
  return `${Math.floor(count)}/${asciiOnly ? 16 : 8}`
}

export function formatSpaceLabel(name) {
  const characters = Array.from(name)
  return characters.length > 4 ? characters.slice(0, 4).join('') + '…' : name
}
