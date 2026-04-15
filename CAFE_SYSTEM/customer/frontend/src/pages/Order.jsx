import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Order.css";

import sandwiches from "../assets/sandwiches.png";
import rice from "../assets/ricemeal.png";
import iced from "../assets/coffee.png";
import hot from "../assets/hot.png";
import noncafe from "../assets/soda.png";
import frappe from "../assets/frappe.png";
import { getMenuCatalog } from "../services/dailyMenuService";
import { getMenuCategories } from "../services/menuService";

function getCategoryImage(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("rice")) return rice;
  if (label.includes("iced")) return iced;
  if (label.includes("hot")) return hot;
  if (label.includes("frap")) return frappe;
  if (label.includes("non") || label.includes("soda")) return noncafe;
  return sandwiches;
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

function formatPrice(value) {
  return `P${Number(value || 0).toFixed(0)}`;
}

function formatCategoryDisplayName(name) {
  return String(name || "")
    .replace(/\s*\(\s*\d+\s*oz\s*\)\s*$/i, "")
    .trim();
}

function Order({ navigateOverride }) {
  const navigate = useNavigate();
  const [remoteCategories, setRemoteCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [categories, items] = await Promise.all([getMenuCategories(), getMenuCatalog()]);
        if (!cancelled) {
          setRemoteCategories(Array.isArray(categories) ? categories : []);
          setMenuItems(Array.isArray(items) ? items : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRemoteCategories([]);
          setMenuItems([]);
          setError(loadError?.message || "Unable to load categories right now.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    return remoteCategories
      .map((category) => {
        const categoryId = String(category.id || "");
        const title = String(category.name || "Category");
        const displayTitle = formatCategoryDisplayName(title);
        const items = menuItems.filter(
          (item) => String(item.categoryId || "") === categoryId && item.isAvailable !== false
        );
        const prices = items.map((item) => Number(item.price || 0) - Number(item.discount || 0)).filter((price) => Number.isFinite(price));
        const startingPrice = prices.length ? Math.min(...prices.map((price) => Math.max(price, 0))) : null;

        return {
          id: categoryId,
          title,
          displayTitle,
          image: getCategoryImage(category.name),
          description: getResolvedCategoryDescription(category),
          itemCount: items.length,
          startingPrice,
        };
      })
      .filter((entry) => entry.id);
  }, [menuItems, remoteCategories]);

  const handleNavigate = (path) => {
    if (navigateOverride) {
      navigateOverride(path);
      return;
    }
    navigate(path);
  };

  return (
    <div className="order-page">
      <section className="order-section">
        <div className="order-section__head">
          <div>
            <p className="order-section__kicker">Browse By Category</p>
            <h1>Jump into the right section fast</h1>
            <p>Use these category cards to head straight to rice meals, coffee, sodas, sandwiches, and more.</p>
          </div>
        </div>

        <div className="order-categories">
        {isLoading ? <p style={{ padding: 24 }}>Loading categories...</p> : null}
        {!isLoading && error ? <p style={{ padding: 24, color: "#a11" }}>{error}</p> : null}
        {!isLoading && !error && !categories.length ? <p style={{ padding: 24 }}>No categories available right now.</p> : null}
        {!isLoading
          ? categories.map((category) => (
            <div
              key={category.id}
              className="order-category-card"
              onClick={() => handleNavigate(`/order/${category.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleNavigate(`/order/${category.id}`);
                }
              }}
            >
              <div className="order-category-card__image-wrap">
                <img src={category.image} alt={category.title} />
              </div>

              <div className="order-category-card__body">
                <div className="order-category-card__top">
                  <h3>{category.displayTitle}</h3>
                  <span className="order-category-card__count">
                    {category.itemCount ? `${category.itemCount} items` : "Updating soon"}
                  </span>
                </div>
                <p>{category.description}</p>
                <div className="order-category-card__footer">
                  <span className="order-category-card__price">
                    {category.startingPrice !== null ? `From ${formatPrice(category.startingPrice)}` : "Tap to browse"}
                  </span>
                  <span className="order-category-card__link">See all</span>
                </div>
              </div>
            </div>
          ))
          : null}
        </div>
      </section>
    </div>
  );
}

export default Order;
