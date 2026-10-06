// 共用素材位置：src/assets/household-icons-by-state/。
// state 是圖示狀態，不是購買清單的完成狀態。
import { ITEM_STATUS, getIconState } from '../../models/item.js';
export const itemIcons = {
  'cotton-pads': {
    'due-soon': new URL('./due-soon/cotton-pads-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/cotton-pads-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/cotton-pads-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/cotton-pads-in-stock.svg', import.meta.url).href,
  },
  'dish-soap': {
    'due-soon': new URL('./due-soon/dish-soap-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/dish-soap-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/dish-soap-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/dish-soap-in-stock.svg', import.meta.url).href,
  },
  'dog-food': {
    'due-soon': new URL('./due-soon/dog-food-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/dog-food-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/dog-food-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/dog-food-in-stock.svg', import.meta.url).href,
  },
  'laundry-detergent': {
    'due-soon': new URL('./due-soon/laundry-detergent-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/laundry-detergent-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/laundry-detergent-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/laundry-detergent-in-stock.svg', import.meta.url).href,
  },
  'light-bulb': {
    'due-soon': new URL('./due-soon/light-bulb-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/light-bulb-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/light-bulb-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/light-bulb-in-stock.svg', import.meta.url).href,
  },
  'rubbing-alcohol': {
    'due-soon': new URL('./due-soon/rubbing-alcohol-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/rubbing-alcohol-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/rubbing-alcohol-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/rubbing-alcohol-in-stock.svg', import.meta.url).href,
  },
  'sanitary-pads': {
    'due-soon': new URL('./due-soon/sanitary-pads-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/sanitary-pads-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/sanitary-pads-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/sanitary-pads-in-stock.svg', import.meta.url).href,
  },
  'sponge': {
    'due-soon': new URL('./due-soon/sponge-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/sponge-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/sponge-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/sponge-in-stock.svg', import.meta.url).href,
  },
  'tissues': {
    'due-soon': new URL('./due-soon/tissues-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/tissues-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/tissues-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/tissues-in-stock.svg', import.meta.url).href,
  },
  'trash-bags': {
    'due-soon': new URL('./due-soon/trash-bags-due-soon.svg', import.meta.url).href,
    'in-shopping-list': new URL('./in-shopping-list/trash-bags-in-shopping-list.svg', import.meta.url).href,
    'restock-needed': new URL('./restock-needed/trash-bags-restock-needed.svg', import.meta.url).href,
    'in-stock': new URL('./in-stock/trash-bags-in-stock.svg', import.meta.url).href,
  },
};

export const emptyStateIcons = {
  'shopping-list-empty': new URL('./empty-states/shopping-list-empty.svg', import.meta.url).href,
  'space-empty': new URL('./empty-states/space-empty.svg', import.meta.url).href,
};

export const ITEM_ICON_KEYS = Object.freeze(Object.keys(itemIcons));
export const commonItemIcons = Object.freeze({
  [ITEM_STATUS.IN_SHOPPING_LIST]: new URL('./common/generic-item-in-shopping-list.svg', import.meta.url).href,
  [ITEM_STATUS.RESTOCK_NEEDED]: new URL('./common/generic-item-restock-needed.svg', import.meta.url).href,
  [ITEM_STATUS.IN_STOCK]: new URL('./common/generic-item-in-stock.svg', import.meta.url).href,
  [ITEM_STATUS.DUE_SOON]: new URL('./common/generic-item-due-soon.svg', import.meta.url).href,
});
export const fallbackItemIcon = commonItemIcons[ITEM_STATUS.IN_STOCK];

// iconKey 是用品種類（例如 tissues），不是單筆用品的 id。
export function getItemIcon(iconKey, state) {
  const normalizedState = getIconState(state);
  const fallback = commonItemIcons[normalizedState];
  if (!Object.hasOwn(itemIcons, iconKey)) return fallback;
  return itemIcons[iconKey][normalizedState] ?? fallback;
}
