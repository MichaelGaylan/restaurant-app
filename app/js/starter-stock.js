// Starter stock list (RRA-024). The items themselves are restaurant-specific,
// so they live in each restaurant's brand.js (starterStock, RSW-020, made by
// the setup wizard); this file keeps the tab layout, the helpers and the
// common non-food supplies every restaurant shares.

const BRAND = globalThis.BRAND;

export const STOCK_STATUS = BRAND.stockStatus || 'Starter list: check it and add your own items.';

// Common non-food supplies (RRA-058): a restaurant without its own
// starterStock gets these. The wizard adds them after the food groups.
export const SUPPLIES = [
  { group: 'Cleaning and chemicals', items: [
    ['Dish machine detergent', 'jug'], ['Dish machine rinse aid', 'jug'], ['Sanitizer (quat)', 'jug'], ['Sanitizer test strips', 'pack'],
    ['Degreaser', 'jug'], ['Floor cleaner', 'jug'], ['Glass cleaner', 'bottle'], ['Oven and grill cleaner', 'can'], ['Fryer boil-out', 'pack'],
    ['Bleach', 'jug'], ['Hand soap refill', 'each'], ['Scrub pads and sponges', 'pack'], ['Trash bags, large', 'case'],
  ] },
  { group: 'Paper and to-go', items: [
    ['To-go clamshells', ''], ['Sauce cups, small', 'sleeve'], ['Sauce cups, large', 'sleeve'], ['Sauce cup lids, small', 'sleeve'], ['Sauce cup lids, large', 'sleeve'], ['Foil', ''], ['Napkins', ''], ['Wet wipes', ''],
    ['To-go bags', ''], ['Gloves', ''], ['Deli paper', ''],
    ['To-go cups and lids', 'sleeve'], ['Straws', 'box'], ['Plastic cutlery kits', 'case'], ['Food boats and basket liners', 'case'],
    ['Plastic wrap', 'roll'], ['Paper towels', 'case'], ['Toilet paper', 'case'],
  ] },
  { group: 'Smallwares', items: [
    ['Hotel pans (1/3, 1/6, 1/9)', 'each'], ['Sheet pans', 'each'], ['Ramekins', 'each'], ['Serving baskets', 'each'], ['Fryer baskets', 'each'],
    ['Tongs', 'each'], ['Spatulas', 'each'], ['Ladles and portion scoops', 'each'], ['Knives', 'each'], ['Cutting boards', 'each'],
    ['Squeeze bottles', 'each'], ['Food storage containers and lids', 'each'], ['Food thermometers', 'each'], ['Measuring cups and spoons', 'set'],
  ] },
  { group: 'Linens and uniforms', items: [
    ['Bar towels', 'bundle'], ['Kitchen side towels', 'bundle'], ['Aprons', 'each'], ['Chef coats', 'each'], ['Staff shirts', 'each'],
    ['Hats and hair nets', 'box'], ['Oven mitts', 'pair'], ['Cut-resistant gloves', 'each'], ['Floor mats', 'each'],
  ] },
];

// The restaurant's own groups first, then any supply group it doesn't have.
const OWN = BRAND.starterStock || [];
export const STARTER_STOCK = [...OWN, ...SUPPLIES.filter((g) => !OWN.some((o) => o.group === g.group))];

// Tabs at the top of Stock (RRA-058). Food covers every group not listed here.
export const NON_FOOD = ['Cleaning and chemicals', 'Paper and to-go', 'Smallwares', 'Linens and uniforms'];
// RRA-115: no All tab; the count opens on the first group.
export const STOCK_TABS = [['food', 'Food and bar'], ['Cleaning and chemicals', 'Cleaning'], ['Paper and to-go', 'Paper and to-go'], ['Smallwares', 'Smallwares'], ['Linens and uniforms', 'Linens and uniforms']];
export const isFood = (group) => !NON_FOOD.includes(group);

// Starter items the 2026-11-19 menu update split or renamed. applyMenu()
// removes them from a phone's list only while they are still untouched.
export const REPLACED_STOCK = BRAND.replacedStock || [];
