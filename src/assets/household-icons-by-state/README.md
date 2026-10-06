# 共用生活用品圖示

固定位置：`src/assets/household-icons-by-state/`。整個資料夾一起提交到 Git，兩位組員均從 `index.js` 取圖，不在各頁重複建立路徑對照。

## 素材分類

原始素材共 42 張 SVG，圖案保持不變，購物清單圖示檔名已統一改為 `in-shopping-list`；另有 `common/` 放置未知用品的通用圖示，依四種狀態取用。舊的 `item-placeholder.svg` 已不再使用。

| 資料夾／狀態 | 用途 | 原始張數 |
| --- | --- | --- |
| `in-shopping-list` | 在購物清單 | 10 |
| `restock-needed` | 需要補貨 | 10 |
| `in-stock` | 庫存充足 | 10 |
| `due-soon` | 接近補貨日 | 10 |
| `empty-states` | 尚無購買清單、尚無空間 | 2 |

## 共用資料約定

```js
import { ITEM_STATUS } from '../models/item.js'

const item = {
  id: 'item-001', // 單筆用品識別，不用來找圖示
  name: '衛生紙',
  iconKey: 'tissues', // 對應圖示種類
  status: ITEM_STATUS.RESTOCK_NEEDED,
}
```

兩筆不同用品可以使用相同 `iconKey`。可用 key：`cotton-pads`、`dish-soap`、`dog-food`、`laundry-detergent`、`light-bulb`、`rubbing-alcohol`、`sanitary-pads`、`sponge`、`tissues`、`trash-bags`；程式可從 `ITEM_ICON_KEYS` 取得清單。

狀態常數和中文標籤統一放在 `src/models/item.js`。尚未建立用品 store；組員建立時沿用上述欄位，其他庫存、分類、空間欄位再依功能增加。

這裡的 `status` 用於選擇圖示；`in-shopping-list` 表示在購物清單。用品庫存與清單成員資格可能同時存在，store 可另外記錄 `inShoppingList`，再集中決定顯示哪種圖示。不要僅因加入待買就改為 `due-soon`。

## Vue / Vite 引用

以下路徑適用於 `src/views/` 和 `src/components/` 的元件，不需要設定 `@` 別名：

```vue
<script setup>
import { getItemIcon, emptyStateIcons } from '../assets/household-icons-by-state/index.js'
import { ITEM_STATUS } from '../models/item.js'
</script>

<template>
  <img
    :src="getItemIcon('tissues', ITEM_STATUS.RESTOCK_NEEDED)"
    alt="衛生紙：需要補貨"
  />
  <img :src="emptyStateIcons['shopping-list-empty']" alt="" />
</template>
```

有用品資料時，使用 `getItemIcon(item.iconKey, item.status)`。`getItemIcon()` 對未知用品回傳 `common/` 中對應狀態的通用圖示；省略或傳入未知狀態時，使用 `in-shopping-list`。已知用品仍使用自己的圖示，不會回傳空值。

`common/generic-item-happy.svg` 與 `common/generic-item-in-shopping-list-plain.svg` 保留供其他畫面使用，目前不加入狀態對應。

若 store 已有其他狀態名稱，請在共用資料層集中轉換，不要在每個頁面各自判斷。空狀態插圖 `space-empty` 用於沒有空間的畫面，不作為用品圖示的備用圖。

## 維護與協作

- 新增用品圖示時，增加各狀態 SVG，並在 `index.js` 補上對應。
- `preview.html`、`manifest.json`、`filename-map.csv` 記錄原始 42 張素材；不包含後加的 `common/` 素材與舊備用圖示。
- `preview.html` 可預覽原始素材，其他說明檔可保留供兩人查對。
- 素材與接口修改一起提交，推送並合併後，另一位組員再同步分支。

## 預設頭貼

`avatars/` 保存四款正式預設頭貼。設定頁與編輯頁共用 `avatars/index.js` 的 `defaultAvatar` 與 `avatarOptions`；目前以第四款為初始頭貼。

```js
import { defaultAvatar, avatarOptions } from '../assets/household-icons-by-state/avatars/index.js'
```
