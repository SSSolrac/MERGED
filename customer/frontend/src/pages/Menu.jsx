import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import menu1 from "../assets/menu1.JPG";
import menu2 from "../assets/menu2.JPG";
import coffeeIcon from "../assets/coffee.png";
import frappeIcon from "../assets/frappe.png";
import hotIcon from "../assets/hot.png";
import riceMealIcon from "../assets/ricemeal.png";
import sandwichesIcon from "../assets/sandwiches.png";
import sodaIcon from "../assets/soda.png";
import MenuOfTheDay from "../components/dailyMenu/MenuOfTheDay";
import { getBestSellingItems, getCurrentDailyMenu, getMenuCatalog } from "../services/dailyMenuService";
import { getMenuCategories } from "../services/menuService";
import { resolveMenuItemImage } from "../utils/menuImages";
import "./Menu.css";

const PESO_SYMBOL = String.fromCharCode(8369);

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeBestSellerValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPrice(value) {
  return `${PESO_SYMBOL}${Number(value || 0).toFixed(0)}`;
}

function formatCategoryDisplayName(name) {
  return String(name || "")
    .replace(/\s*\(\s*\d+\s*oz\s*\)\s*$/i, "")
    .trim();
}

function getCategoryFallbackImage(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("rice")) return riceMealIcon;
  if (label.includes("iced")) return coffeeIcon;
  if (label.includes("hot")) return hotIcon;
  if (label.includes("frap")) return frappeIcon;
  if (label.includes("non") || label.includes("soda")) return sodaIcon;
  return sandwichesIcon;
}

function getCategoryDescription(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("rice")) return "Comforting plates and hearty savory meals for a fuller bite.";
  if (label.includes("iced")) return "Chilled coffee favorites for quick cafe runs and slow afternoons.";
  if (label.includes("hot")) return "Warm coffee classics when you want something cozy and simple.";
  if (label.includes("frap")) return "Sweet blended drinks for dessert-like sips and cafe treats.";
  if (label.includes("non") || label.includes("soda")) return "Refreshing non-coffee drinks with bright fruit and soda flavors.";
  return "Customer-friendly cafe staples you can open and order in just a few taps.";
}

function getResolvedCategoryDescription(category) {
  const fromDb = String(category?.description || "").trim();
  if (fromDb) return fromDb;
  return getCategoryDescription(category?.name);
}

function getCategoryQuickCopy(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("rice")) return "Hearty meals when you want something filling and easy to choose.";
  if (label.includes("iced")) return "Cold coffee picks for cafe runs, study sessions, and afternoon breaks.";
  if (label.includes("hot")) return "Warm coffee classics for slower mornings and cozy cafe moments.";
  if (label.includes("frap")) return "Sweet blended drinks when you want something more treat-like.";
  if (label.includes("non") || label.includes("soda")) return "Refreshing fruity drinks if you are skipping coffee today.";
  return "Open this category and browse the full list of available cafe items.";
}

function mapMenuItem(item, categoryById) {
  const name = String(item?.name || "").trim() || "Item";
  const categoryId = String(item?.categoryId || "").trim();
  const categoryName = categoryById.get(categoryId) || "";
  const discountAmount = Number(item?.effectiveDiscount ?? item?.discount ?? 0);
  const basePrice = Number(item?.price || 0);
  const price = Number(item?.effectivePrice ?? Math.max(basePrice - discountAmount, 0));

  return {
    id: String(item?.id || name),
    code: String(item?.code || "").trim(),
    categoryId,
    categoryName,
    name,
    description: String(item?.description || "").trim(),
    discountAmount,
    price,
    basePrice,
    isDiscountActive: Boolean(item?.isDiscountActive ?? discountAmount > 0),
    isAvailable: item?.isAvailable !== false,
    isNew: Boolean(item?.isNew),
    isLimited: Boolean(item?.isLimited),
    image:
      item?.imageUrl ||
      resolveMenuItemImage(name, categoryName) ||
      getCategoryFallbackImage(categoryName || name),
    orderLink: categoryId ? `/order/${categoryId}?focus=${encodeURIComponent(name)}` : "/order",
  };
}

function getDailyHighlightNames(menuData) {
  if (!Array.isArray(menuData?.categories)) return new Set();

  return new Set(
    menuData.categories
      .flatMap((category) => (Array.isArray(category?.items) ? category.items : []))
      .map((itemName) => normalizeKey(itemName))
      .filter(Boolean)
  );
}

function Menu() {
  const [dailyMenu, setDailyMenu] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [bestSellerRows, setBestSellerRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [data, catalog, categories, bestSellers] = await Promise.all([
          getCurrentDailyMenu(),
          getMenuCatalog(),
          getMenuCategories().catch(() => []),
          getBestSellingItems({ limit: 18, lookbackDays: 180 }).catch(() => []),
        ]);
        setDailyMenu(data);
        setCatalogItems(Array.isArray(catalog) ? catalog : []);
        setMenuCategories(categories.filter((category) => category.isActive !== false));
        setBestSellerRows(Array.isArray(bestSellers) ? bestSellers : []);
      } catch (loadError) {
        setError(loadError?.message || "Could not load today's featured menu right now.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const categoryById = useMemo(
    () => new Map(menuCategories.map((category) => [String(category.id || ""), String(category.name || "").trim()])),
    [menuCategories]
  );

  const preparedItems = useMemo(
    () => catalogItems.map((item) => mapMenuItem(item, categoryById)).filter((item) => item.categoryId),
    [catalogItems, categoryById]
  );

  const availableItems = useMemo(() => preparedItems.filter((item) => item.isAvailable), [preparedItems]);
  const dailyHighlightNames = useMemo(() => getDailyHighlightNames(dailyMenu), [dailyMenu]);
  const bestSellerLookup = useMemo(() => {
    const lookup = new Map();
    bestSellerRows.forEach((row, index) => {
      const normalizedCode = normalizeKey(row.menuItemCode);
      const normalizedName = normalizeKey(row.itemName);
      const summary = {
        rank: index,
        quantitySold: normalizeBestSellerValue(row.quantitySold),
        revenue: normalizeBestSellerValue(row.revenue),
      };

      if (normalizedCode && !lookup.has(`code:${normalizedCode}`)) {
        lookup.set(`code:${normalizedCode}`, summary);
      }
      if (normalizedName && !lookup.has(`name:${normalizedName}`)) {
        lookup.set(`name:${normalizedName}`, summary);
      }
    });
    return lookup;
  }, [bestSellerRows]);

  const featuredItems = useMemo(() => {
    const getBestSellerSummary = (item) => {
      const byCode = item.code ? bestSellerLookup.get(`code:${normalizeKey(item.code)}`) : null;
      if (byCode) return byCode;
      return bestSellerLookup.get(`name:${normalizeKey(item.name)}`) || null;
    };

    return [...availableItems]
      .sort((left, right) => {
        const leftBestSeller = getBestSellerSummary(left);
        const rightBestSeller = getBestSellerSummary(right);

        if (leftBestSeller && rightBestSeller) {
          if (leftBestSeller.quantitySold !== rightBestSeller.quantitySold) {
            return rightBestSeller.quantitySold - leftBestSeller.quantitySold;
          }
          if (leftBestSeller.revenue !== rightBestSeller.revenue) {
            return rightBestSeller.revenue - leftBestSeller.revenue;
          }
          if (leftBestSeller.rank !== rightBestSeller.rank) {
            return leftBestSeller.rank - rightBestSeller.rank;
          }
        } else if (leftBestSeller || rightBestSeller) {
          return leftBestSeller ? -1 : 1;
        }

        const leftIsChefPick = dailyHighlightNames.has(normalizeKey(left.name));
        const rightIsChefPick = dailyHighlightNames.has(normalizeKey(right.name));
        if (leftIsChefPick !== rightIsChefPick) return leftIsChefPick ? -1 : 1;

        const discountDelta = right.discountAmount - left.discountAmount;
        if (discountDelta) return discountDelta;

        return left.name.localeCompare(right.name);
      })
      .slice(0, 6);
  }, [availableItems, bestSellerLookup, dailyHighlightNames]);

  const categoryCards = useMemo(() => {
    return menuCategories.map((category) => {
      const categoryId = String(category.id || "");
      const categoryName = String(category.name || "Category").trim() || "Category";
      const displayName = formatCategoryDisplayName(categoryName);
      const items = availableItems.filter((item) => item.categoryId === categoryId);
      const previewItems = items.slice(0, 3);
      const startingPrice = items.length ? Math.min(...items.map((item) => Number(item.price || 0))) : null;
      const heroImage = previewItems[0]?.image || getCategoryFallbackImage(categoryName);

      return {
        id: categoryId,
        name: categoryName,
        displayName,
        description: getResolvedCategoryDescription(category),
        itemCount: items.length,
        previewItems,
        startingPrice,
        heroImage,
        isNew: Boolean(category?.isNew),
      };
    });
  }, [availableItems, menuCategories]);

  const previewSections = useMemo(
    () => categoryCards.filter((category) => category.previewItems.length),
    [categoryCards]
  );

  const quickLinks = useMemo(
    () => categoryCards.filter((category) => category.itemCount > 0).slice(0, 4),
    [categoryCards]
  );

  const heroFeaturedItems = useMemo(() => featuredItems.slice(0, 3), [featuredItems]);

  return (
    <div className="menu-page">
      <section className="menu-hero">
        <div className="menu-hero__copy">
          <p className="menu-eyebrow">Happy Tails Pet Cafe</p>
          <h1 className="menu-title">Our Cafe Menu</h1>
          <p className="menu-intro">
            Browse chef picks, best sellers, and category highlights in one place before jumping into the full ordering flow.
          </p>

          <div className="menu-hero__actions">
            <Link to="/order" className="menu-cta menu-cta--primary">
              Start Your Order
            </Link>
            <a href="#menu-categories" className="menu-cta menu-cta--secondary">
              Browse Categories
            </a>
            <a href="#menu-reference" className="menu-cta menu-cta--ghost">
              Menu
            </a>
          </div>

          <div className="menu-hero__spotlight">
            <p className="menu-hero__spotlight-label">Popular right now</p>
            <div className="menu-hero__spotlight-list">
                {heroFeaturedItems.length ? (
                  heroFeaturedItems.map((item) => (
                    <Link key={item.id} to={item.orderLink} className="menu-hero__spotlight-chip">
                      <span>{item.name}</span>
                      <strong>{formatPrice(item.price)}</strong>
                    </Link>
                  ))
                ) : (
                <div className="menu-hero__spotlight-empty">Best sellers will appear here once the latest menu finishes loading.</div>
              )}
            </div>
          </div>
        </div>

        <div className="menu-hero__panel">
          <div className="menu-hero__panel-head">
            <p className="menu-section__kicker">Quick Start</p>
            <h2>Choose what you feel like having</h2>
            <p>These shortcuts take you straight into the menu sections customers usually open first.</p>
          </div>

          <div className="menu-hero__shortcut-grid">
            {quickLinks.map((category) => (
              <Link key={category.id} to={`/order/${category.id}`} className="menu-hero__shortcut-card">
                <div className="menu-hero__shortcut-top">
                  <strong>{category.displayName}</strong>
                  <span>{category.startingPrice !== null ? `From ${formatPrice(category.startingPrice)}` : "Browse"}</span>
                </div>
                <p>{getCategoryQuickCopy(category.name)}</p>
              </Link>
            ))}
          </div>

          <p className="menu-hero__note">
            Start with best sellers for quick decisions, then open a category when you want more choices.
          </p>
        </div>
      </section>

      {isLoading ? <p className="menu-loading">Loading menu of the day...</p> : null}
      {!isLoading && error ? <p className="menu-loading">{error}</p> : null}
      {!isLoading && !error ? <MenuOfTheDay menuData={dailyMenu} /> : null}

      <section className="menu-section" id="menu-best-sellers">
        <div className="menu-section__head">
          <div>
            <p className="menu-section__kicker">Start Here</p>
            <h2>Best sellers</h2>
            <p>Top picks ranked from actual completed orders, then blended with chef highlights when data is tied.</p>
          </div>
          <Link to="/order" className="menu-inline-link">
            Open full order page
          </Link>
        </div>

        <section className="featured-grid">
          {!featuredItems.length && !isLoading ? <p className="menu-loading">No menu items available right now.</p> : null}
          {featuredItems.map((item) => (
            <Link key={item.id} to={item.orderLink} className="featured-card">
              <img src={item.image} alt={item.name} />
              <div className="featured-card__body">
                <p className="featured-card__eyebrow">{item.categoryName || "Menu pick"}</p>
                <h3>{item.name}</h3>
                <p className="featured-card__price">{formatPrice(item.price)}</p>
                {item.description ? <p className="featured-card__description">{item.description}</p> : null}
                <div className="featured-card__meta">
                  {item.isNew ? <span className="menu-status-tag menu-status-tag--new">NEW</span> : null}
                  {item.isDiscountActive ? <span className="menu-status-tag menu-status-tag--discount">{formatPrice(item.discountAmount)} OFF</span> : null}
                  {item.isLimited ? <span className="menu-status-tag menu-status-tag--limited">LIMITED</span> : null}
                  <span className={item.isAvailable ? "available" : "sold-out"}>
                    {item.isAvailable ? "Available" : "Unavailable"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </section>

      <section className="menu-section" id="menu-categories">
        <div className="menu-section__head">
          <div>
            <p className="menu-section__kicker">Browse By Category</p>
            <h2>Jump into the right section fast</h2>
            <p>Use these category cards to head straight to rice meals, coffee, sodas, sandwiches, and more.</p>
          </div>
        </div>

        <div className="menu-category-grid">
          {!categoryCards.length && !isLoading ? <p className="menu-loading">No categories available right now.</p> : null}
          {categoryCards.map((category) => (
            <Link key={category.id} to={`/order/${category.id}`} className="menu-category-card">
              <div className="menu-category-card__image-wrap">
                <img src={category.heroImage} alt={category.name} />
              </div>

              <div className="menu-category-card__body">
                <div className="menu-category-card__top">
                  <div className="menu-category-card__title-stack">
                    <h3>{category.displayName}</h3>
                    <div className="menu-category-card__badges">
                      {category.isNew ? <span className="menu-status-tag menu-status-tag--new">NEW</span> : null}
                    </div>
                  </div>
                  <span className="menu-category-card__count">
                    {category.itemCount ? `${category.itemCount} items` : "Updating soon"}
                  </span>
                </div>
                <p>{category.description}</p>
                <div className="menu-category-card__footer">
                  <span className="menu-category-card__price">
                    {category.startingPrice !== null ? `From ${formatPrice(category.startingPrice)}` : "Tap to browse"}
                  </span>
                  <span className="menu-category-card__link">See all</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <div className="menu-section__head">
          <div>
            <p className="menu-section__kicker">Preview The Menu</p>
            <h2>Category highlights</h2>
            <p>Get a quick feel for each category before you open the full ordering page.</p>
          </div>
        </div>

        <div className="menu-preview-stack">
          {!previewSections.length && !isLoading ? <p className="menu-loading">No category previews available right now.</p> : null}
          {previewSections.map((category) => (
            <article key={category.id} className="menu-preview-section">
              <div className="menu-preview-section__header">
                <div>
                  <h3>{category.displayName}</h3>
                  <p>{category.description}</p>
                </div>
                <Link to={`/order/${category.id}`} className="menu-inline-link">
                  See all {category.displayName}
                </Link>
              </div>

              <div className="menu-preview-grid">
                {category.previewItems.map((item) => (
                  <Link key={item.id} to={item.orderLink} className="menu-preview-card">
                    <img src={item.image} alt={item.name} />
                    <div className="menu-preview-card__body">
                      <h4>{item.name}</h4>
                      {item.description ? <p>{item.description}</p> : <p>Open this category to add the item to your basket.</p>}
                      <div className="menu-preview-card__tags">
                        {item.isNew ? <span className="menu-status-tag menu-status-tag--new">NEW</span> : null}
                        {item.isDiscountActive ? <span className="menu-status-tag menu-status-tag--discount">{formatPrice(item.discountAmount)} OFF</span> : null}
                        {item.isLimited ? <span className="menu-status-tag menu-status-tag--limited">LIMITED</span> : null}
                      </div>
                      <div className="menu-preview-card__footer">
                        <span>{formatPrice(item.price)}</span>
                        <span className="menu-preview-card__chip">Order now</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="menu-section menu-section--reference" id="menu-reference">
        <div className="menu-section__head">
          <div>
            <p className="menu-section__kicker">Menu</p>
            <h2>Full menu</h2>
            <p>Use the full cafe menu boards here as a visual reference while the easier ordering sections stay above.</p>
          </div>
        </div>

        <div className="menu-grid">
          <div className="menu-card">
            <div className="menu-card__header">
              <h3>Drinks menu</h3>
              <p>Full menu reference</p>
            </div>
            <img src={menu1} alt="Drinks Menu" />
          </div>
          <div className="menu-card">
            <div className="menu-card__header">
              <h3>Food menu</h3>
              <p>Full menu reference</p>
            </div>
            <img src={menu2} alt="Food Menu" />
          </div>
        </div>
      </section>
    </div>
  );
}

export default Menu;
