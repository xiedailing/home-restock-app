// 主頁與用品／設定子頁共用整頁轉場及返回視角。
// 主導覽四頁互切不播放動畫，由 App.vue 排除。
export const supportsPagePresentation = path => ['/inventory', '/shopping', '/settings'].includes(path) || path.startsWith('/settings/') || path.startsWith('/items/') || path.startsWith('/restock/')
export const pageScrollPositions = new Map()
export const supportsScrollRestoration = path => path === '/settings' || path.startsWith('/settings/')
export let leavingPageScroll = 0
export function rememberPageScroll(path, top) {
  leavingPageScroll = top
  if (supportsScrollRestoration(path)) pageScrollPositions.set(path, top)
}
