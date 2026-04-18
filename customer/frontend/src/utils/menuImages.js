import americanoHot from "../assets/Americano (Hot).jpg";
import americanoIced from "../assets/Americano (Iced).jpg";
import blueberrySoda from "../assets/Blueberry Soda.jpg";
import bakedMacaroni from "../assets/NEW FOOD/Baked Macaroni.jpg";
import chickenFilletWithRice from "../assets/NEW FOOD/Breaded Chicken Fillet with Rice.jpg";
import burgerSteakWithRice from "../assets/NEW FOOD/Burger Steak With Rice.jpg";
import caramelMacchiatoFrappe from "../assets/Caramel Macchiato Frappe.jpg";
import cheesyBeefBurger from "../assets/NEW FOOD/Cheesy Beef Burger.jpg";
import chickenAlfredoPasta from "../assets/NEW FOOD/Chicken Alfredo Pasta.jpg";
import chickenCordonBleuWithRice from "../assets/NEW FOOD/Chicken Cordon Bleu with Rice.jpg";
import chickenMacaroniSalad from "../assets/NEW FOOD/Chicken Macaroni Salad.jpg";
import chickenPopcorn from "../assets/NEW FOOD/Chicken Popcorn.jpg";
import chickenPoppers from "../assets/NEW FOOD/Chicken poppers with Rice.webp";
import chocoJavaChip from "../assets/Choco Java Chip Frappe.jpg";
import cloudAmericano from "../assets/ICED COFFEE/Cloud Americano.jpg";
import coffeeIcon from "../assets/coffee.png";
import creamyCarbonara from "../assets/Creamy Carbonara.jpg";
import creamyTunaPesto from "../assets/Creamy Tuna Pesto.jpg";
import fishAndFries from "../assets/sourced/Fish & Fries (good for sharing).jpg";
import fourSeasons from "../assets/Four Seasons.jpg";
import frappeIcon from "../assets/frappe.png";
import greenAppleSoda from "../assets/Green Apple Soda.jpg";
import grilledCheese from "../assets/Grilled Cheese Sandwich.jpg";
import hotChocolate from "../assets/Hot Chocolate.jpg";
import hotIcon from "../assets/hot.png";
import homemadePorkEmbotidoWithRice from "../assets/NEW FOOD/Homemade Pork Embotido With Rice.jpg";
import homemadePorkSiomai from "../assets/sourced/Homemade Pork Siomai (4pcs).jpg";
import homemadePorkSiomaiWithRice from "../assets/sourced/Homemade Pork Siomai (4pcs) with Rice.jpg";
import hungarianSausageWithRice from "../assets/sourced/Hungarian Sausage with Rice.jpg";
import huskyLogo from "../assets/husky-logo.jpg";
import icedChocoMilk from "../assets/Iced Choco Milk.jpg";
import icedCocoaTiramisu from "../assets/ICED COFFEE/Iced Cocoa Tiramisu.jpg";
import icedCoconutLatte from "../assets/ICED COFFEE/Iced Coconut Latte.webp";
import icedMatchaLatte from "../assets/ICED COFFEE/Iced matcha latte.webp";
import icedMochaLatte from "../assets/ICED COFFEE/Iced mocha latte.jpg";
import icedVanillaLatte from "../assets/ICED COFFEE/Iced Vanilla Latte.jpg";
import logo from "../assets/logo.png";
import matchaLatte from "../assets/HOT COFFEE/matcha latte.jpg";
import matchaFrappe from "../assets/Matcha Frappe.jpg";
import pattern from "../assets/pattern.png";
import pet1 from "../assets/pet1.jpg";
import pet2 from "../assets/pet2.jpg";
import pet3 from "../assets/pet3.jpg";
import profile from "../assets/profile.png";
import riceMealIcon from "../assets/ricemeal.png";
import sandwichesIcon from "../assets/sandwiches.png";
import sodaIcon from "../assets/soda.png";
import spanishLatteHot from "../assets/HOT COFFEE/Spanish Latte.jpg";
import spanishLatte from "../assets/ICED COFFEE/Spanish Latte.jpg";
import strawberryFrappe from "../assets/Strawberry Frappe.jpg";
import strawberryMilk from "../assets/Strawberry Milk.jpg";
import strawberrySoda from "../assets/Strawberry Soda.jpg";
import toastedHungarian from "../assets/Toasted Cheesy Hungarian Sandwich.jpg";
import toastedTunaSandwich from "../assets/NEW FOOD/Toasted Tuna Sandwich.webp";

// Payment/brand assets used elsewhere; keep for compatibility.
import bdo from "../assets/BDO.webp";
import gcash from "../assets/GCASH.webp";
import maribank from "../assets/MARIBANK.webp";
import qrph from "../assets/QRPH.webp";

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const assetEntries = [
  ["Americano (Hot)", americanoHot],
  ["Americano (Iced)", americanoIced],
  ["Baked Macaroni", bakedMacaroni],
  ["Blueberry Soda", blueberrySoda],
  ["Chicken Fillet with Rice", chickenFilletWithRice],
  ["Burger Steak with Rice", burgerSteakWithRice],
  ["Caramel Macchiato Frappe", caramelMacchiatoFrappe],
  ["Caramel Macchiato", coffeeIcon],
  ["Cafe Latte", coffeeIcon],
  ["Cafe Latte iced", coffeeIcon],
  ["Cafe Latte hot", coffeeIcon],
  ["Cheesy Beef Burger", cheesyBeefBurger],
  ["Chicken Alfredo Pasta", chickenAlfredoPasta],
  ["Chicken Cordon Bleu with Rice", chickenCordonBleuWithRice],
  ["Chicken Macaroni Salad", chickenMacaroniSalad],
  ["Chicken Popcorn", chickenPopcorn],
  ["Chicken Poppers with Rice", chickenPoppers],
  ["Choco Java Chip Frappe", chocoJavaChip],
  ["Cloud Americano", cloudAmericano],
  ["Cloud Americano iced", cloudAmericano],
  ["coffee", coffeeIcon],
  ["Creamy Carbonara", creamyCarbonara],
  ["Creamy Tuna Pesto", creamyTunaPesto],
  ["Fish & Fries (good for sharing)", fishAndFries],
  ["Four Seasons", fourSeasons],
  ["frappe", frappeIcon],
  ["Green Apple Soda", greenAppleSoda],
  ["Grilled Cheese Sandwich", grilledCheese],
  ["Hot Chocolate", hotChocolate],
  ["hot", hotIcon],
  ["Homemade Pork Embotido with Rice", homemadePorkEmbotidoWithRice],
  ["Homemade Pork Siomai (4pcs)", homemadePorkSiomai],
  ["Homemade Pork Siomai (4pcs) with Rice", homemadePorkSiomaiWithRice],
  ["Hungarian Sausage with Rice", hungarianSausageWithRice],
  ["husky-logo", huskyLogo],
  ["Iced Choco Milk", icedChocoMilk],
  ["Iced Cocoa Tiramisu", icedCocoaTiramisu],
  ["Iced Coconut Latte", icedCoconutLatte],
  ["Iced Matcha Latte", icedMatchaLatte],
  ["Iced Mocha Latte", icedMochaLatte],
  ["Iced Vanilla Latte", icedVanillaLatte],
  ["logo", logo],
  ["Matcha Latte", matchaLatte],
  ["Matcha Latte hot", matchaLatte],
  ["Matcha Frappe", matchaFrappe],
  ["pattern", pattern],
  ["pet1", pet1],
  ["pet2", pet2],
  ["pet3", pet3],
  ["profile", profile],
  ["ricemeal", riceMealIcon],
  ["sandwiches", sandwichesIcon],
  ["soda", sodaIcon],
  ["Spanish Latte", spanishLatte],
  ["Spanish Latte hot", spanishLatteHot],
  ["Spanish Latte iced", spanishLatte],
  ["Strawberry Frappe", strawberryFrappe],
  ["Strawberry Milk", strawberryMilk],
  ["Strawberry Soda", strawberrySoda],
  ["Toasted Cheesy Hungarian Sandwich", toastedHungarian],
  ["Toasted Tuna Sandwich", toastedTunaSandwich],
  // payment/brand assets
  ["bdo", bdo],
  ["gcash", gcash],
  ["maribank", maribank],
  ["qrph", qrph],
].map(([label, url]) => ({ key: normalizeKey(label), url }));

const urlByKey = new Map(assetEntries.map((entry) => [entry.key, entry.url]));

function bestContainsMatch(nameKey) {
  if (!nameKey) return null;

  let best = null;
  for (const entry of assetEntries) {
    if (!entry.key.includes(nameKey)) continue;
    if (!best || entry.key.length < best.key.length) best = entry;
  }
  return best?.url || null;
}

export function resolveMenuItemImage(itemName, categoryName = "") {
  const nameKey = normalizeKey(itemName);
  if (!nameKey) return null;

  const categoryKey = normalizeKey(categoryName);
  const variant = categoryKey.includes("iced") ? "iced" : categoryKey.includes("hot") ? "hot" : "";

  const candidates = [];
  if (variant) candidates.push(normalizeKey(`${itemName} ${variant}`));
  candidates.push(nameKey);

  for (const candidate of candidates) {
    const url = urlByKey.get(candidate);
    if (url) return url;
  }

  return bestContainsMatch(nameKey);
}
