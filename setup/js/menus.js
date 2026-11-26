// Starter menus for the setup wizard (RSW-020). Each is a typical menu for
// that kind of restaurant, with common prices to start from, and the food
// and bar stock it needs. The wizard copies one into the restaurant's
// brand.js, where it can be changed before it goes live. Names and prices
// are generic, not any real restaurant's.
//
// menu: [{ section, kind, items: [[name, price]] }]. kind is '' for food, or a
// drink kind: na, beer, wine, liquor, cocktail (bar ticket, 21+ check).
// stock: [{ group, items: [[name, unit]] }]. Cleaning, paper, smallwares and
// linens are added by the shared app for every restaurant.

export const KINDS = [['', 'Food'], ['na', 'Non-alcoholic'], ['beer', 'Beer'], ['wine', 'Wine'], ['liquor', 'Liquor / shots'], ['cocktail', 'Cocktails']];

const SODAS = [['Fountain soda', '2.99'], ['Iced tea', '2.99'], ['Lemonade', '3.29'], ['Bottled water', '2.00'], ['Coffee', '2.49']];
const SODA_STOCK = [['Soda syrup (bag-in-box)', 'box'], ['CO2 tank', 'tank'], ['Iced tea bags', 'box'], ['Lemonade mix', 'case'], ['Bottled water', 'case'], ['Coffee', 'bag'], ['Sugar and sweetener packets', 'case'], ['Creamer', 'case']];

const BAR_GRILL = {
  key: 'bar', name: 'Bar & grill', blurb: 'Wings, burgers, sandwiches, salads, beer and cocktails',
  menu: [
    { section: 'Appetizers', items: [['Mozzarella Sticks', '8.99'], ['Fried Pickles', '7.99'], ['Loaded Nachos', '11.99'], ['Spinach Artichoke Dip', '10.99'], ['Basket of Fries', '5.49'], ['Onion Rings', '6.99']] },
    { section: 'Wings', items: [['6 Wings', '9.99'], ['12 Wings', '17.99'], ['24 Wings', '33.99'], ['Boneless Wings', '12.99']] },
    { section: 'Burgers', items: [['Classic Burger', '12.99'], ['Bacon Cheeseburger', '14.49'], ['BBQ Burger', '14.49'], ['Mushroom Swiss Burger', '14.49'], ['Veggie Burger', '12.99']] },
    { section: 'Sandwiches', items: [['Grilled Chicken Sandwich', '12.99'], ['Buffalo Chicken Wrap', '12.99'], ['Philly Cheesesteak', '13.99'], ['Club Sandwich', '12.49'], ['BLT', '10.99']] },
    { section: 'Salads', items: [['House Salad', '8.99'], ['Caesar Salad', '9.99'], ['Cobb Salad', '13.99'], ['Buffalo Chicken Salad', '13.99']] },
    { section: 'Sides', items: [['Fries', '3.99'], ['Tater Tots', '3.99'], ['Coleslaw', '2.99'], ['Side Salad', '4.49']] },
    { section: 'Desserts', items: [['Brownie Sundae', '7.99'], ['Cheesecake', '6.99']] },
    { section: 'Drinks', kind: 'na', items: SODAS },
    { section: 'Beer', kind: 'beer', items: [['Domestic bottle', '4.00'], ['Import bottle', '5.00'], ['Draft pint', '5.50'], ['Pitcher', '14.00']] },
    { section: 'Wine', kind: 'wine', items: [['House red (glass)', '7.00'], ['House white (glass)', '7.00']] },
    { section: 'Cocktails', kind: 'cocktail', items: [['Margarita', '8.00'], ['Long Island Iced Tea', '9.00'], ['Rum & Coke', '6.50'], ['Vodka Cranberry', '6.50'], ['Old Fashioned', '9.00']] },
  ],
  stock: [
    { group: 'Proteins', items: [['Chicken wings', 'case (40 lb)'], ['Boneless wing bites', 'case'], ['Chicken breast', 'case'], ['Burger patties', 'case'], ['Veggie burger patties', 'case'], ['Shaved steak', 'lb'], ['Bacon', 'case'], ['Deli turkey', 'lb'], ['Deli ham', 'lb']] },
    { group: 'Dairy and cheese', items: [['American cheese, sliced', 'case'], ['Swiss cheese, sliced', 'case'], ['Cheddar, shredded', 'bag'], ['Mozzarella sticks, frozen', 'case'], ['Nacho cheese sauce', 'can'], ['Sour cream', 'tub'], ['Butter', 'case']] },
    { group: 'Frozen and fried', items: [['French fries', 'case'], ['Tater tots', 'case'], ['Onion rings', 'case'], ['Breaded pickle chips', 'case'], ['Fryer oil', 'jug (35 lb)']] },
    { group: 'Produce', items: [['Romaine', 'case'], ['Iceberg lettuce', 'case'], ['Tomatoes', 'case'], ['Onions', 'bag'], ['Mushrooms', 'case'], ['Jalapeños', 'lb'], ['Celery and carrots', 'case'], ['Lemons and limes', 'case']] },
    { group: 'Bakery and dry goods', items: [['Burger buns', 'case'], ['Hoagie rolls', 'case'], ['Sandwich bread', 'case'], ['Flour tortillas', 'case'], ['Tortilla chips', 'case'], ['Croutons', 'bag'], ['Flour and breading', 'bag'], ['Salt, pepper and seasonings', 'each']] },
    { group: 'Sauces and dressings', items: [['Ranch', 'jug'], ['Blue cheese', 'jug'], ['Buffalo sauce', 'jug'], ['BBQ sauce', 'jug'], ['Caesar dressing', 'jug'], ['Ketchup', 'case'], ['Mustard', 'jug'], ['Mayo', 'jug'], ['Salsa', 'jug']] },
    { group: 'Non-alcoholic beverages', items: SODA_STOCK },
    { group: 'Bar', items: [['Domestic beer', 'case (24)'], ['Import beer', 'case (24)'], ['Draft beer keg', 'keg'], ['House red wine', 'bottle (750 ml)'], ['House white wine', 'bottle (750 ml)'], ['Well vodka', 'bottle (1 L)'], ['Well rum', 'bottle (1 L)'], ['Well tequila', 'bottle (1 L)'], ['Well whiskey', 'bottle (1 L)'], ['Well gin', 'bottle (1 L)'], ['Triple sec', 'bottle (1 L)'], ['Sour mix', 'bottle (1 L)'], ['Cranberry juice', 'bottle (1 L)'], ['Bitters', 'bottle'], ['Cocktail cherries', 'jar']] },
  ],
  posChoices: {
    wings: { title: 'Sauce', options: ['Mild', 'Medium', 'Hot', 'BBQ', 'Honey Mustard', 'Plain'] },
    burger: { title: 'Temperature', options: ['Medium rare', 'Medium', 'Medium well', 'Well done'] },
    salad: { title: 'Dressing', options: ['Ranch', 'Blue Cheese', 'Caesar', 'Italian', 'None'] },
  },
  dishExample: 'Bacon Cheeseburger',
};

const PIZZA = {
  key: 'pizza', name: 'Pizza & Italian', blurb: 'Pizzas, pasta, subs, salads and wine',
  menu: [
    { section: 'Starters', items: [['Garlic Knots', '5.99'], ['Mozzarella Sticks', '8.49'], ['Fried Calamari', '12.99'], ['Bruschetta', '8.99']] },
    { section: 'Pizza', items: [['Cheese Pizza (12")', '12.99'], ['Cheese Pizza (16")', '16.99'], ['Pepperoni Pizza (12")', '14.49'], ['Pepperoni Pizza (16")', '18.99'], ['Supreme Pizza (16")', '21.99'], ['Margherita Pizza (12")', '14.99'], ['Extra topping', '2.00']] },
    { section: 'Pasta', items: [['Spaghetti & Meatballs', '15.99'], ['Fettuccine Alfredo', '15.49'], ['Chicken Parmesan', '17.99'], ['Lasagna', '16.99'], ['Baked Ziti', '14.99']] },
    { section: 'Subs', items: [['Italian Sub', '11.99'], ['Meatball Sub', '11.49'], ['Chicken Parm Sub', '12.49']] },
    { section: 'Salads', items: [['Garden Salad', '8.49'], ['Caesar Salad', '9.49'], ['Antipasto Salad', '12.99']] },
    { section: 'Desserts', items: [['Tiramisu', '7.99'], ['Cannoli', '5.99']] },
    { section: 'Drinks', kind: 'na', items: SODAS },
    { section: 'Beer', kind: 'beer', items: [['Domestic bottle', '4.00'], ['Italian lager', '5.50']] },
    { section: 'Wine', kind: 'wine', items: [['Chianti (glass)', '8.00'], ['Pinot Grigio (glass)', '8.00'], ['House red (bottle)', '28.00'], ['House white (bottle)', '28.00']] },
  ],
  stock: [
    { group: 'Proteins', items: [['Pepperoni', 'case'], ['Italian sausage', 'case'], ['Meatballs', 'case'], ['Chicken breast', 'case'], ['Deli ham', 'lb'], ['Salami', 'lb'], ['Calamari', 'case']] },
    { group: 'Dairy and cheese', items: [['Mozzarella, shredded', 'case'], ['Fresh mozzarella', 'case'], ['Parmesan', 'bag'], ['Ricotta', 'tub'], ['Provolone, sliced', 'case'], ['Heavy cream', 'case'], ['Butter', 'case']] },
    { group: 'Produce', items: [['Romaine', 'case'], ['Tomatoes', 'case'], ['Basil', 'bunch'], ['Onions', 'bag'], ['Green peppers', 'case'], ['Mushrooms', 'case'], ['Black olives', 'can'], ['Garlic', 'jar'], ['Lemons', 'case']] },
    { group: 'Dough and dry goods', items: [['Pizza flour', 'bag (50 lb)'], ['Yeast', 'pack'], ['Pizza dough balls, frozen', 'case'], ['Spaghetti', 'case'], ['Fettuccine', 'case'], ['Lasagna sheets', 'case'], ['Penne / ziti', 'case'], ['Sub rolls', 'case'], ['Breadcrumbs', 'bag'], ['Olive oil', 'jug'], ['Salt, pepper and seasonings', 'each']] },
    { group: 'Sauces', items: [['Pizza sauce', 'case (#10 cans)'], ['Marinara', 'case (#10 cans)'], ['Alfredo sauce', 'case'], ['Caesar dressing', 'jug'], ['Italian dressing', 'jug'], ['Ranch', 'jug']] },
    { group: 'Frozen', items: [['Mozzarella sticks, frozen', 'case'], ['Garlic knots, frozen', 'case']] },
    { group: 'Non-alcoholic beverages', items: SODA_STOCK },
    { group: 'Bar', items: [['Domestic beer', 'case (24)'], ['Italian lager', 'case (24)'], ['Chianti', 'bottle (750 ml)'], ['Pinot Grigio', 'bottle (750 ml)'], ['House red wine', 'bottle (750 ml)'], ['House white wine', 'bottle (750 ml)']] },
    { group: 'Pizza boxes', items: [['Pizza boxes 12"', 'bundle'], ['Pizza boxes 16"', 'bundle'], ['Pizza savers', 'case']] },
  ],
  posChoices: { salad: { title: 'Dressing', options: ['Italian', 'Caesar', 'Ranch', 'None'] } },
  dishExample: 'Pepperoni Pizza (16")',
};

const CAFE = {
  key: 'cafe', name: 'Café & breakfast', blurb: 'Breakfast plates, coffee, sandwiches and bakery',
  menu: [
    { section: 'Breakfast', items: [['Two Eggs Any Style', '9.99'], ['Pancake Stack', '9.49'], ['French Toast', '10.49'], ['Breakfast Burrito', '10.99'], ['Biscuits & Gravy', '8.99'], ['Veggie Omelet', '11.49'], ['Ham & Cheese Omelet', '11.99']] },
    { section: 'Sandwiches', items: [['Turkey Club', '11.99'], ['Grilled Cheese', '8.49'], ['Chicken Salad Croissant', '11.49'], ['BLT', '10.49']] },
    { section: 'Salads & Soup', items: [['Soup of the Day (cup)', '4.99'], ['Soup of the Day (bowl)', '6.99'], ['Garden Salad', '8.49'], ['Chicken Caesar Salad', '12.49']] },
    { section: 'Sides', items: [['Bacon', '3.99'], ['Sausage', '3.99'], ['Home Fries', '3.49'], ['Toast', '1.99'], ['Fresh Fruit', '3.99']] },
    { section: 'Bakery', items: [['Muffin', '3.29'], ['Croissant', '3.49'], ['Cinnamon Roll', '4.29'], ['Cookie', '2.49']] },
    { section: 'Coffee & Drinks', kind: 'na', items: [['Drip Coffee', '2.49'], ['Latte', '4.49'], ['Cappuccino', '4.49'], ['Espresso', '2.99'], ['Hot Tea', '2.49'], ['Orange Juice', '3.49'], ['Iced Coffee', '3.99']] },
  ],
  stock: [
    { group: 'Proteins', items: [['Eggs', 'case (15 dozen)'], ['Bacon', 'case'], ['Breakfast sausage', 'case'], ['Ham', 'lb'], ['Deli turkey', 'lb'], ['Chicken breast', 'case']] },
    { group: 'Dairy and cheese', items: [['Whole milk', 'gallon'], ['Oat milk', 'case'], ['Half and half', 'case'], ['Butter', 'case'], ['Cheddar, shredded', 'bag'], ['American cheese, sliced', 'case']] },
    { group: 'Produce', items: [['Potatoes', 'case (50 lb)'], ['Onions', 'bag'], ['Peppers', 'case'], ['Spinach', 'case'], ['Tomatoes', 'case'], ['Romaine', 'case'], ['Fresh fruit (melon, berries)', 'case'], ['Oranges for juice', 'case']] },
    { group: 'Bakery and dry goods', items: [['Pancake mix', 'bag'], ['Sliced bread', 'case'], ['Croissants', 'case'], ['Biscuit mix', 'bag'], ['Tortillas', 'case'], ['Muffin mix', 'bag'], ['Syrup', 'jug'], ['Flour', 'bag (50 lb)'], ['Sugar', 'bag'], ['Gravy mix', 'case']] },
    { group: 'Coffee and tea', items: [['Coffee beans', 'bag (5 lb)'], ['Espresso beans', 'bag (5 lb)'], ['Tea bags', 'box'], ['Flavor syrups', 'bottle'], ['Hot cups and lids', 'sleeve']] },
  ],
  posChoices: {},
  dishExample: 'Veggie Omelet',
};

const MEXICAN = {
  key: 'mexican', name: 'Mexican', blurb: 'Tacos, burritos, plates, margaritas and beer',
  menu: [
    { section: 'Starters', items: [['Chips & Salsa', '3.99'], ['Queso Dip', '7.49'], ['Guacamole', '8.99'], ['Nachos', '11.99']] },
    { section: 'Tacos', items: [['Chicken Tacos (3)', '11.99'], ['Steak Tacos (3)', '13.99'], ['Carnitas Tacos (3)', '12.99'], ['Fish Tacos (3)', '13.49']] },
    { section: 'Burritos', items: [['Chicken Burrito', '12.49'], ['Steak Burrito', '13.99'], ['Bean & Cheese Burrito', '9.99'], ['Burrito Bowl', '12.99']] },
    { section: 'Plates', items: [['Chicken Enchiladas', '14.49'], ['Steak Fajitas', '18.99'], ['Chicken Fajitas', '16.99'], ['Quesadilla', '11.49'], ['Chile Relleno', '13.99']] },
    { section: 'Sides', items: [['Rice', '2.99'], ['Beans', '2.99'], ['Street Corn', '4.49']] },
    { section: 'Desserts', items: [['Churros', '6.49'], ['Flan', '5.99']] },
    { section: 'Drinks', kind: 'na', items: [['Fountain soda', '2.99'], ['Horchata', '3.49'], ['Mexican Coke', '3.49'], ['Agua fresca', '3.49']] },
    { section: 'Beer', kind: 'beer', items: [['Mexican lager', '5.00'], ['Domestic bottle', '4.00'], ['Michelada', '7.00']] },
    { section: 'Margaritas', kind: 'cocktail', items: [['House Margarita', '8.00'], ['Top-shelf Margarita', '11.00'], ['Frozen Margarita', '8.50'], ['Paloma', '9.00']] },
  ],
  stock: [
    { group: 'Proteins', items: [['Chicken thighs', 'case'], ['Skirt steak', 'case'], ['Pork shoulder', 'case'], ['White fish', 'case'], ['Ground beef', 'lb']] },
    { group: 'Dairy and cheese', items: [['Monterey Jack, shredded', 'bag'], ['Queso fresco', 'case'], ['Cotija', 'case'], ['Queso dip', 'case'], ['Sour cream', 'tub']] },
    { group: 'Produce', items: [['Avocados', 'case'], ['Limes', 'case'], ['Cilantro', 'bunch'], ['Onions', 'bag'], ['Tomatoes', 'case'], ['Jalapeños', 'lb'], ['Poblano peppers', 'case'], ['Bell peppers', 'case'], ['Lettuce', 'case'], ['Corn', 'case']] },
    { group: 'Tortillas and dry goods', items: [['Corn tortillas', 'case'], ['Flour tortillas, burrito size', 'case'], ['Tortilla chips', 'case'], ['Rice', 'bag (50 lb)'], ['Pinto beans', 'case'], ['Black beans', 'case'], ['Spices (cumin, chili, oregano)', 'each'], ['Fryer oil', 'jug (35 lb)']] },
    { group: 'Sauces and salsas', items: [['Salsa roja', 'jug'], ['Salsa verde', 'jug'], ['Enchilada sauce', 'case'], ['Hot sauce', 'case']] },
    { group: 'Non-alcoholic beverages', items: [['Soda syrup (bag-in-box)', 'box'], ['CO2 tank', 'tank'], ['Mexican Coke', 'case (24)'], ['Horchata mix', 'case'], ['Agua fresca mix', 'case']] },
    { group: 'Bar', items: [['Mexican lager', 'case (24)'], ['Domestic beer', 'case (24)'], ['Well tequila', 'bottle (1 L)'], ['Top-shelf tequila', 'bottle (750 ml)'], ['Triple sec', 'bottle (1 L)'], ['Margarita mix', 'bottle (1 L)'], ['Grapefruit soda', 'bottle (1 L)'], ['Michelada mix', 'bottle'], ['Margarita salt', 'tub']] },
  ],
  posChoices: {},
  dishExample: 'Steak Tacos (3)',
};

export const TEMPLATES = [BAR_GRILL, PIZZA, CAFE, MEXICAN];
export const BLANK = { key: 'blank', name: 'Start empty', blurb: 'No dishes: the restaurant adds its own in Recipes', menu: [], stock: [], posChoices: {}, dishExample: '' };

// Copy a template's menu and stock into a draft (plain data, editable).
export const fromTemplate = (t) => ({
  menuKey: t.key,
  menu: t.menu.map((s) => ({ section: s.section, kind: s.kind || '', items: s.items.map(([n, p]) => [n, p]) })),
  stock: t.stock.map((g) => ({ group: g.group, items: g.items.map(([n, u]) => [n, u]) })),
  posChoices: t.posChoices || {},
  dishExample: t.dishExample || '',
});

// "Paste a menu": one dish per line with its price at the end ("Classic
// Burger 12.99", "Fries ..... $3.99"); a line without a price starts a section.
export function parseMenu(text) {
  const out = [];
  let sec = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\s.·…:\-–—]*\$?\s?(\d{1,4}(?:[.,]\d{2})?)\s*$/);
    if (m && m[1].trim() && !/^\d+$/.test(line)) {
      if (!sec) { sec = { section: 'Menu', kind: '', items: [] }; out.push(sec); }
      sec.items.push([m[1].trim().replace(/[\s.·…:\-–—$]+$/, ''), (+m[2].replace(',', '.')).toFixed(2)]);
    } else {
      sec = { section: line.replace(/:$/, ''), kind: '', items: [] };
      out.push(sec);
    }
  }
  return out.filter((s) => s.items.length || out.length === 1);
}

// Guess a section's drink kind from its name (the shared app does the same).
export function guessKind(section) {
  const s = String(section || '').toLowerCase();
  if (/margarita|cocktail|mixed|martini/.test(s)) return 'cocktail';
  if (/beer|draft|bottles|cans/.test(s)) return 'beer';
  if (/wine/.test(s)) return 'wine';
  if (/liquor|spirits|shots?\b|whiske?y|bourbon/.test(s)) return 'liquor';
  if (/drink|beverage|coffee|soda|juice/.test(s)) return 'na';
  return '';
}

// A short fingerprint of the menu, so phones pick up a changed menu.
export function menuHash(menu, stock) {
  const s = JSON.stringify([menu, stock]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
