// 共用呈現入口：目前只啟用購買清單與設定，其他頁日後可明確加入。
export const supportsPagePresentation = path => path === '/shopping' || path === '/settings' || path.startsWith('/settings/')
export const pageScrollPositions = new Map()
export let leavingPageScroll = 0
export function rememberPageScroll(path, top) {
  leavingPageScroll = top
  if (supportsPagePresentation(path)) pageScrollPositions.set(path, top)
}
