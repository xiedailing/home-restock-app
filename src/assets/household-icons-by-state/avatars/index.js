import avatar01 from './avatar-default-01.svg'
import avatar02 from './avatar-default-02.svg'
import avatar03 from './avatar-default-03.svg'
import avatar04 from './avatar-default-04.svg'

// 第四款沿用目前畫面的預設選取；空字串表示使用預設頭貼。
export const defaultAvatar = avatar04
export const avatarOptions = Object.freeze([
  { label: '預設頭貼 1', image: avatar01, value: avatar01 },
  { label: '預設頭貼 2', image: avatar02, value: avatar02 },
  { label: '預設頭貼 3', image: avatar03, value: avatar03 },
  { label: '預設頭貼 4', image: avatar04, value: '' },
])
