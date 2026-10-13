// 主頁與用品／設定子頁共用整頁轉場及返回視角。
// 主導覽四頁互切不播放動畫，由 App.vue 排除。
export const supportsPagePresentation = path => ['/home', '/inventory', '/shopping', '/settings'].includes(path) || path.startsWith('/settings/') || path.startsWith('/items/')
export const pageScrollPositions = new Map()
export let leavingPageScroll = 0
export function rememberPageScroll(path, top) {
  leavingPageScroll = top
  if (supportsPagePresentation(path)) pageScrollPositions.set(path, top)
}
