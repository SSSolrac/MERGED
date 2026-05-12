function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s*\(\s*\d+\s*oz\s*\)\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const byItemAndCategory = new Map([
  ["baked macaroni|pasta sandwiches", "Creamy baked macaroni layered with rich sauce and a comforting cheesy finish."],
  ["chicken alfredo pasta|pasta sandwiches", "Creamy Alfredo pasta with tender chicken for a filling cafe-style plate."],
  ["chicken macaroni salad|pasta sandwiches", "A chilled, creamy macaroni salad with chicken and a lightly sweet finish."],
  ["cheesy beef burger|pasta sandwiches", "A juicy beef burger stacked with cheese for a hearty, satisfying bite."],
  ["chicken popcorn|pasta sandwiches", "Crispy bite-sized chicken pieces that are easy to snack on and share."],
  ["fish fries good for sharing|pasta sandwiches", "Crispy fish and fries served as a savory platter made for sharing."],
  ["grilled cheese sandwich|pasta sandwiches", "Toasted bread with melted cheese for a simple, comforting snack."],
  ["homemade pork siomai 4pcs|pasta sandwiches", "Four homemade pork siomai pieces with a savory, satisfying bite."],
  ["toasted cheesy hungarian sandwich|pasta sandwiches", "A toasted sandwich packed with cheesy filling and savory Hungarian sausage."],
  ["toasted tuna sandwich|pasta sandwiches", "A warm toasted sandwich filled with creamy tuna and a light savory finish."],
  ["chicken fillet with rice|rice meals", "Crispy chicken fillet served with rice for an easy, satisfying meal."],
  ["burger steak with rice|rice meals", "Savory burger steak with rice for a rich, filling comfort meal."],
  ["chicken cordon bleu with rice|rice meals", "Golden chicken cordon bleu with rice for a hearty cafe-style plate."],
  ["chicken poppers with rice|rice meals", "Crispy chicken poppers paired with rice for a playful, savory meal."],
  ["homemade pork embotido with rice|rice meals", "Homemade pork embotido served with rice for a sweet-savory classic."],
  ["homemade pork siomai 4pcs with rice|rice meals", "Four homemade pork siomai with rice for a simple, budget-friendly meal."],
  ["hungarian sausage with rice|rice meals", "Savory Hungarian sausage served with rice for a bold, satisfying bite."],
  ["americano|iced coffee", "A bold and refreshing iced coffee with a clean, crisp finish."],
  ["cafe latte|iced coffee", "A smooth iced latte with creamy milk and mellow espresso notes."],
  ["caramel macchiato|iced coffee", "Layered espresso, milk, and caramel for a sweet, balanced iced sip."],
  ["cloud americano|iced coffee", "A richer iced Americano with a smooth finish and deep coffee flavor."],
  ["iced caramel latte|iced coffee", "Creamy iced latte sweetened with caramel for an easy, mellow drink."],
  ["iced cocoa tiramisu|iced coffee", "A dessert-inspired iced coffee with cocoa notes and a creamy finish."],
  ["iced coconut latte|iced coffee", "A creamy iced latte with coconut notes and a light tropical finish."],
  ["iced hazelnut latte|iced coffee", "A smooth iced latte with nutty hazelnut flavor and mellow sweetness."],
  ["iced matcha latte|iced coffee", "A creamy iced matcha drink with a smooth earthy and lightly sweet taste."],
  ["iced mocha latte|iced coffee", "An iced latte blended with chocolate notes for a richer cafe treat."],
  ["iced vanilla latte|iced coffee", "A creamy iced latte with soft vanilla sweetness and smooth coffee flavor."],
  ["spanish latte|iced coffee", "A sweet and creamy iced latte with a richer, milk-forward finish."],
  ["americano|hot coffee", "A smooth hot espresso-based coffee with a clean, bold finish."],
  ["cafe latte|hot coffee", "Warm espresso and steamed milk for a mellow and comforting cup."],
  ["caramel macchiato|hot coffee", "A warm caramel coffee with smooth milk and a lightly sweet finish."],
  ["matcha latte|hot coffee", "A warm matcha latte with creamy milk and a gentle earthy flavor."],
  ["spanish latte|hot coffee", "A warm, sweet latte with a creamy texture and rich cafe flavor."],
  ["four seasons|non caffeinated", "A bright fruit drink that is light, refreshing, and easy to enjoy."],
  ["hot chocolate|non caffeinated", "A warm chocolate drink with a smooth, comforting finish."],
  ["iced choco milk|non caffeinated", "A chilled chocolate milk drink that is creamy, sweet, and refreshing."],
  ["strawberry milk|non caffeinated", "A creamy strawberry drink with a sweet, playful cafe feel."],
  ["blueberry soda|non caffeinated", "A fizzy fruit soda with bright blueberry flavor and a refreshing finish."],
  ["green apple soda|non caffeinated", "A sparkling green apple soda with a crisp and tangy bite."],
  ["strawberry soda|non caffeinated", "A bubbly strawberry soda that tastes sweet, bright, and refreshing."],
  ["caramel macchiato frappe|frappuccino", "A blended caramel coffee frappe with a sweet, creamy finish."],
  ["choco java chip frappe|frappuccino", "A rich chocolate coffee frappe blended for a cool dessert-like treat."],
  ["matcha frappe|frappuccino", "A creamy blended matcha drink with a smooth and lightly sweet taste."],
  ["peanut butter choco frappe|frappuccino", "A blended frappe with chocolate and peanut butter for a richer sip."],
  ["strawberry frappe|frappuccino", "A sweet blended strawberry drink that tastes like a chilled dessert."],
]);

const byCategory = new Map([
  ["pasta sandwiches", "A customer favorite made for quick bites, sharing, or a filling cafe meal."],
  ["rice meals", "A savory meal plate that is filling, comforting, and easy to enjoy anytime."],
  ["iced coffee", "A chilled cafe drink made for refreshing sips and smooth coffee flavor."],
  ["hot coffee", "A warm cafe drink with smooth flavor and a comforting finish."],
  ["non caffeinated", "A refreshing cafe drink with bright flavor and an easy, enjoyable finish."],
  ["frappuccino", "A blended cafe treat with a smooth texture and dessert-like flavor."],
]);

export function getMenuItemDescription(itemName, categoryName = "") {
  const nameKey = normalizeText(itemName);
  const categoryKey = normalizeText(categoryName);

  const exact = byItemAndCategory.get(`${nameKey}|${categoryKey}`);
  if (exact) return exact;

  return byCategory.get(categoryKey) || "A Happy Tails menu pick made for easy, feel-good ordering.";
}

