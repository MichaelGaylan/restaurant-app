// Brand settings for Harbor Street Grill (demo; made with the setup wizard 0.1.0 on 2026-11-22, Bar & grill starter menu added with 0.2.0 on 2026-11-26).
// Names, pictures, colors and this restaurant's own data space. The app
// itself is shared: /app. Keep index.html and manifest.webmanifest in step
// with the names and icons (iPhone reads them from the page).

self.BRAND = {
  // Names
  appName: "Harbor Kitchen", // page title, About, startup screen, messages
  shortName: "Harbor", // name under the home-screen icon
  restaurant: "Harbor Street Grill", // printed footers, notices
  location: "Savannah, GA",
  tagline: "Recipes and kitchen notes for Harbor Street Grill, Savannah, GA.",
  credit: "© 2026 Demo Brand", // © line in About. Empty = hidden.

  // Pictures and video
  logo: "assets/logo.png",
  icon180: "assets/app-icon-180.png",
  icon192: "assets/app-icon-192.png",
  icon512: "assets/app-icon-512.png",
  favicon: "assets/favicon-32.png",
  introVideo: "", // '' = no startup clip

  // Look. null keeps the Apple / Android system colors.
  accent: "#00778b",

  // Data space: this restaurant's own. Never reuse or change on a live app.
  dataPrefix: "rsw.harbor.",
  dbName: "rsw-harbor",
  teamId: "harbor", // shared data: teams/<teamId> in Firebase
  reportPrefix: "Harbor —",

  // Set up later (Needs you): Admin phone key, shared data, Report a problem.
  adminKeys: [], // empty = the app offers Admin setup
  firebase: null, // null = data stays on each phone
  reportKey: "", // Web3Forms key; empty = reports are copied instead
  brandVersion: 1795717672669, // change when names or pictures change, so phones update

  // Starter menu (RSW-020): sections, dishes and prices, added once to Recipes
  // and the Point of sale on the Admin phone. Change menuVersion after editing
  // so phones pick it up. [name, price]; an empty price hides it from Orders.
  menuVersion: "w-1i7r5yj",
  menu: [
    { section: "Appetizers", items: [
      ["Mozzarella Sticks","8.99"],
      ["Fried Pickles","7.99"],
      ["Loaded Nachos","11.99"],
      ["Spinach Artichoke Dip","10.99"],
      ["Basket of Fries","5.49"],
      ["Onion Rings","6.99"],
    ] },
    { section: "Wings", items: [
      ["6 Wings","9.99"],
      ["12 Wings","17.99"],
      ["24 Wings","33.99"],
      ["Boneless Wings","12.99"],
    ] },
    { section: "Burgers", items: [
      ["Classic Burger","12.99"],
      ["Bacon Cheeseburger","14.49"],
      ["BBQ Burger","14.49"],
      ["Mushroom Swiss Burger","14.49"],
      ["Veggie Burger","12.99"],
    ] },
    { section: "Sandwiches", items: [
      ["Grilled Chicken Sandwich","12.99"],
      ["Buffalo Chicken Wrap","12.99"],
      ["Philly Cheesesteak","13.99"],
      ["Club Sandwich","12.49"],
      ["BLT","10.99"],
    ] },
    { section: "Salads", items: [
      ["House Salad","8.99"],
      ["Caesar Salad","9.99"],
      ["Cobb Salad","13.99"],
      ["Buffalo Chicken Salad","13.99"],
    ] },
    { section: "Sides", items: [
      ["Fries","3.99"],
      ["Tater Tots","3.99"],
      ["Coleslaw","2.99"],
      ["Side Salad","4.49"],
    ] },
    { section: "Desserts", items: [
      ["Brownie Sundae","7.99"],
      ["Cheesecake","6.99"],
    ] },
    { section: "Drinks", items: [
      ["Fountain soda","2.99"],
      ["Iced tea","2.99"],
      ["Lemonade","3.29"],
      ["Bottled water","2.00"],
      ["Coffee","2.49"],
    ] },
    { section: "Beer", items: [
      ["Domestic bottle","4.00"],
      ["Import bottle","5.00"],
      ["Draft pint","5.50"],
      ["Pitcher","14.00"],
    ] },
    { section: "Wine", items: [
      ["House red (glass)","7.00"],
      ["House white (glass)","7.00"],
    ] },
    { section: "Cocktails", items: [
      ["Margarita","8.00"],
      ["Long Island Iced Tea","9.00"],
      ["Rum & Coke","6.50"],
      ["Vodka Cranberry","6.50"],
      ["Old Fashioned","9.00"],
    ] },
  ],
  // Drink sections go to the bar ticket; alcohol asks for a 21+ ID check.
  drinks: {"sections":{"Drinks":"na","Beer":"beer","Wine":"wine","Cocktails":"cocktail"},"legalAge":21,"pourOz":{"liquor":1.5,"wine":5,"beer":16},"choices":{"liquor":{"title":"How","options":[["Rocks"],["Neat"],["Up"],["Shot"],["Double",2,2]]},"cocktail":{"title":"How","options":[["Rocks"],["Up"],["Double",2,2]]}}},
  // Choices asked for when a dish is added (wings sauce, burger temperature, salad dressing).
  posChoices: {"wings":{"title":"Sauce","options":["Mild","Medium","Hot","BBQ","Honey Mustard","Plain"]},"burger":{"title":"Temperature","options":["Medium rare","Medium","Medium well","Well done"]},"salad":{"title":"Dressing","options":["Ranch","Blue Cheese","Caesar","Italian","None"]}},
  dishExample: "Bacon Cheeseburger", // example in the Recipes Name box

  // Starter stock (RSW-020): food and bar groups. Cleaning, paper, smallwares
  // and linens come from the shared app for every restaurant. [name, unit].
  stockStatus: "Starter list from the setup wizard: check it and set a par for each item.",
  starterStock: [
    { group: "Proteins", items: [["Chicken wings","case (40 lb)"], ["Boneless wing bites","case"], ["Chicken breast","case"], ["Burger patties","case"], ["Veggie burger patties","case"], ["Shaved steak","lb"], ["Bacon","case"], ["Deli turkey","lb"], ["Deli ham","lb"]] },
    { group: "Dairy and cheese", items: [["American cheese, sliced","case"], ["Swiss cheese, sliced","case"], ["Cheddar, shredded","bag"], ["Mozzarella sticks, frozen","case"], ["Nacho cheese sauce","can"], ["Sour cream","tub"], ["Butter","case"]] },
    { group: "Frozen and fried", items: [["French fries","case"], ["Tater tots","case"], ["Onion rings","case"], ["Breaded pickle chips","case"], ["Fryer oil","jug (35 lb)"]] },
    { group: "Produce", items: [["Romaine","case"], ["Iceberg lettuce","case"], ["Tomatoes","case"], ["Onions","bag"], ["Mushrooms","case"], ["Jalapeños","lb"], ["Celery and carrots","case"], ["Lemons and limes","case"]] },
    { group: "Bakery and dry goods", items: [["Burger buns","case"], ["Hoagie rolls","case"], ["Sandwich bread","case"], ["Flour tortillas","case"], ["Tortilla chips","case"], ["Croutons","bag"], ["Flour and breading","bag"], ["Salt, pepper and seasonings","each"]] },
    { group: "Sauces and dressings", items: [["Ranch","jug"], ["Blue cheese","jug"], ["Buffalo sauce","jug"], ["BBQ sauce","jug"], ["Caesar dressing","jug"], ["Ketchup","case"], ["Mustard","jug"], ["Mayo","jug"], ["Salsa","jug"]] },
    { group: "Non-alcoholic beverages", items: [["Soda syrup (bag-in-box)","box"], ["CO2 tank","tank"], ["Iced tea bags","box"], ["Lemonade mix","case"], ["Bottled water","case"], ["Coffee","bag"], ["Sugar and sweetener packets","case"], ["Creamer","case"]] },
    { group: "Bar", items: [["Domestic beer","case (24)"], ["Import beer","case (24)"], ["Draft beer keg","keg"], ["House red wine","bottle (750 ml)"], ["House white wine","bottle (750 ml)"], ["Well vodka","bottle (1 L)"], ["Well rum","bottle (1 L)"], ["Well tequila","bottle (1 L)"], ["Well whiskey","bottle (1 L)"], ["Well gin","bottle (1 L)"], ["Triple sec","bottle (1 L)"], ["Sour mix","bottle (1 L)"], ["Cranberry juice","bottle (1 L)"], ["Bitters","bottle"], ["Cocktail cherries","jar"]] },
  ],
};
