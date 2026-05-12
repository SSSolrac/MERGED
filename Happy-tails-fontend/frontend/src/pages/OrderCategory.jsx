import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { getMenuCatalog } from "../services/dailyMenuService";
import { getMenuCategories } from "../services/menuService";
import "./OrderCategory.css";

import sandwiches from "../assets/sandwiches.png";
import rice from "../assets/ricemeal.png";
import iced from "../assets/coffee.png";
import hot from "../assets/hot.png";
import noncafe from "../assets/soda.png";
import frappe from "../assets/frappe.png";
import { getMenuItemDescription } from "../utils/menuDescriptions";
import { resolveMenuItemImage } from "../utils/menuImages";

const PESO_SYMBOL = String.fromCharCode(8369);

function getCategoryImage(name) {
  const label = String(name || "").toLowerCase();
  if (label.includes("rice")) return rice;
  if (label.includes("iced")) return iced;
  if (label.includes("hot")) return hot;
  if (label.includes("frap")) return frappe;
  if (label.includes("non") || label.includes("soda")) return noncafe;
  return sandwiches;
}

function formatMoney(value) {
  return `${PESO_SYMBOL}${Number(value || 0).toFixed(2)}`;
}

function formatMoneyCompact(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return `${PESO_SYMBOL}0`;
  return `${PESO_SYMBOL}${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function buildDiscountLabel(item, discountAmount) {
  const storedLabel = String(item.discountLabel || "").trim();
  if (storedLabel) return storedLabel;

  const discountType = String(item.discountType || "amount").toLowerCase();
  const discountValue = Number(item.discountValue ?? discountAmount ?? 0);
  if (discountType === "percent" && Number.isFinite(discountValue) && discountValue > 0) {
    return `${discountValue}% off`;
  }

  return `${formatMoneyCompact(discountAmount)} off`;
}

function formatCategoryDisplayName(name) {
  return String(name || "")
    .replace(/\s*\(\s*\d+\s*oz\s*\)\s*$/i, "")
    .trim();
}

function isDrinkCategory(name) {
  const label = String(name || "").toLowerCase();
  return (
    label.includes("iced") ||
    label.includes("hot") ||
    label.includes("frap") ||
    label.includes("non-caffeinated") ||
    label.includes("soda")
  );
}

function shouldUseContainedCards(name) {
  const label = String(name || "").toLowerCase();
  return label.includes("frap") || label.includes("non-caffeinated") || label.includes("soda");
}

export default function OrderCategory() {
  const { category: categoryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem, openMiniCart } = useCart();
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);

  const debugEnabled = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    const params = new URLSearchParams(location.search || "");
    return params.get("debug") === "1";
  }, [location.search]);

  const focusQuery = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return String(params.get("focus") || params.get("item") || "").trim();
  }, [location.search]);

  const didScrollToFocusRef = useRef(false);

  useEffect(() => {
    didScrollToFocusRef.current = false;
  }, [categoryId, focusQuery]);

  useEffect(() => {
    setSelectedItem(null);
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [itemsResult, categoriesResult] = await Promise.allSettled([getMenuCatalog(), getMenuCategories()]);
        if (cancelled) return;
        const items = itemsResult.status === "fulfilled" ? itemsResult.value : [];
        const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

        setMenuItems(Array.isArray(items) ? items : []);
        setMenuCategories(Array.isArray(categories) ? categories : []);

        const errors = [itemsResult, categoriesResult]
          .filter((result) => result.status === "rejected")
          .map((result) => {
            const reason = result.reason;
            return reason?.message ? String(reason.message) : String(reason || "Unable to load menu data.");
          })
          .filter(Boolean);

        if (errors.length) setLoadError(errors.join(" | "));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedItem) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedItem(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedItem]);

  const category = useMemo(
    () => menuCategories.find((entry) => String(entry.id || "") === String(categoryId || "")) || null,
    [categoryId, menuCategories]
  );

  const categoryTitle = category?.name || "Menu";
  const categoryDisplayTitle = useMemo(() => formatCategoryDisplayName(categoryTitle), [categoryTitle]);
  const isDrinkPage = useMemo(() => isDrinkCategory(categoryTitle), [categoryTitle]);
  const useContainedCards = useMemo(() => shouldUseContainedCards(categoryTitle), [categoryTitle]);

  const items = useMemo(() => {
    const activeCategoryId = String(categoryId || "").trim();
    const filtered = menuItems.filter((item) => {
      const rawCategory = String(item.categoryId || "").trim();
      if (!rawCategory) return false;
      return rawCategory === activeCategoryId;
    });
    return filtered.map((item) => {
      const safeName = String(item.name || "").trim() || "Item";
      const basePrice = Number(item.price || 0);
      const discount = Number(item.effectiveDiscount ?? item.discount ?? 0);
      const discounted = Number(item.effectivePrice ?? (discount > 0 ? Math.max(basePrice - discount, 0) : basePrice));
      const isDiscountActive = Boolean(item.isDiscountActive ?? discount > 0);
      return {
        id: item.id,
        code: String(item.code || "").trim(),
        menuItemCode: String(item.code || "").trim(),
        name: safeName,
        description: String(item.description || "").trim() || getMenuItemDescription(safeName, categoryTitle),
        displayName: safeName,
        image: item.imageUrl || resolveMenuItemImage(safeName, categoryTitle) || getCategoryImage(categoryTitle),
        price: discounted,
        originalPrice: basePrice,
        unitPrice: basePrice,
        discountAmount: discount,
        discountLabel: isDiscountActive ? buildDiscountLabel(item, discount) : "",
        isDiscountActive,
        isAvailable: item.isAvailable !== false,
        isNew: Boolean(item.isNew),
        isLimited: Boolean(item.isLimited),
        categoryId: item.categoryId,
      };
    });
  }, [categoryId, categoryTitle, menuItems]);

  useEffect(() => {
    if (!focusQuery) return;
    if (didScrollToFocusRef.current) return;
    if (isLoading) return;
    if (!items.length) return;

    const q = focusQuery.toLowerCase();
    const match = items.find((entry) => {
      const name = String(entry.name || "").toLowerCase();
      const displayName = String(entry.displayName || "").toLowerCase();
      return name.includes(q) || displayName.includes(q);
    });

    if (!match) return;

    const el = document.getElementById(`menu-item-${match.id}`);
    if (!el) return;

    didScrollToFocusRef.current = true;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        el.scrollIntoView();
      }
    });
  }, [focusQuery, isLoading, items]);

  const debugCategorySummary = useMemo(() => {
    if (!debugEnabled) return null;
    const activeCategoryId = String(categoryId || "").trim();
    const uniqueItemCategoryValues = Array.from(
      new Set(menuItems.map((item) => String(item.categoryId || "").trim()).filter(Boolean))
    ).slice(0, 12);

    return {
      activeCategoryId,
      categoryTitle,
      categoryDisplayTitle,
      menuCategoriesCount: menuCategories.length,
      menuItemsCount: menuItems.length,
      filteredItemsCount: items.length,
      uniqueItemCategoryValues,
    };
  }, [categoryDisplayTitle, categoryId, categoryTitle, debugEnabled, items.length, menuCategories, menuItems]);

  const handleAddToBasket = (item) => {
    if (!item || item.isAvailable === false) return;
    addItem(item);
  };

  if (!isLoading && !category && items.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <p>Category not found.</p>
        <button onClick={() => navigate("/order")}>Back</button>
      </div>
    );
  }

  return (
    <div
      className={`ordercat-page${isDrinkPage ? " ordercat-page--drink" : ""}${useContainedCards ? " ordercat-page--contain-cards" : ""}`}
    >
      <div className="ordercat-header">
        <div className="ordercat-header-inner">
          <button className="ordercat-back-btn" onClick={() => navigate("/order")}>
            {"<"} Back to Categories
          </button>

          <h1 className="ordercat-header-title">{categoryDisplayTitle}</h1>

          <div />
        </div>
      </div>

      <p className="ordercat-subtitle">Pick an item and add it to your basket.</p>

      {debugCategorySummary ? (
        <details style={{ maxWidth: 1100, margin: "0 auto 12px", padding: "0 16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Debug</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>
            {JSON.stringify(debugCategorySummary, null, 2)}
          </pre>
        </details>
      ) : null}

      <div className="ordercat-grid">
        {isLoading ? <p style={{ padding: 24 }}>Loading items...</p> : null}
        {!isLoading && loadError ? <p style={{ padding: 24, color: "#a11" }}>{loadError}</p> : null}
        {!isLoading && !loadError && !menuItems.length ? <p style={{ padding: 24 }}>No menu items available right now.</p> : null}
        {!isLoading && !loadError && menuItems.length > 0 && !items.length ? (
          <p style={{ padding: 24 }}>No items available in this category.</p>
        ) : null}

        {items.map((item) => {
          const isFocused =
            Boolean(focusQuery) &&
            (String(item.name || "").toLowerCase().includes(String(focusQuery || "").toLowerCase()) ||
              String(item.displayName || "").toLowerCase().includes(String(focusQuery || "").toLowerCase()));

          return (
            <div
              id={`menu-item-${item.id}`}
              className={`item-card${isFocused ? " item-card--focused" : ""}`}
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedItem(item);
                }
              }}
            >
              <div className="item-imgWrap">
                <img className="item-img" src={item.image} alt={item.displayName || item.name} />
                <div className="item-card-tags item-card-tags--left">
                  {item.isNew ? <span className="item-card-tag item-card-tag--new">NEW</span> : null}
                  {item.isLimited ? <span className="item-card-tag item-card-tag--limited">LIMITED</span> : null}
                </div>
                {item.isDiscountActive ? (
                  <div className="item-card-tags item-card-tags--right">
                    <span className="item-card-tag item-card-tag--discounted">DISCOUNTED</span>
                  </div>
                ) : null}
              </div>

              <div className="item-body">
                <div className="item-top">
                  <h3 className="item-name">{item.displayName || item.name}</h3>
                  <span className="price">{formatMoney(item.price)}</span>
                </div>
                <div className="item-tag-row">
                  {item.isDiscountActive ? <p className="item-status-badge item-status-badge--discount">{item.discountLabel}</p> : null}
                  {item.originalPrice && item.originalPrice !== item.price ? (
                    <p className="item-status-badge item-status-badge--ghost">Was {formatMoney(item.originalPrice)}</p>
                  ) : null}
                </div>

                <button
                  className="add-btn"
                  disabled={item.isAvailable === false}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAddToBasket(item);
                  }}
                >
                  {item.isAvailable === false ? "Unavailable" : "Add to Basket"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedItem ? (
        <div
          className="item-modal-overlay"
          onClick={() => setSelectedItem(null)}
          role="presentation"
        >
          <div className="item-modal" onClick={(event) => event.stopPropagation()}>
            <button className="item-modal-close" onClick={() => setSelectedItem(null)} aria-label="Close item details">
              Close
            </button>

            <div className="item-modal-content">
              <div className="item-modal-image-wrap">
                <img className="item-modal-image" src={selectedItem.image} alt={selectedItem.displayName || selectedItem.name} />
              </div>

              <div className="item-modal-body">
                <h3>{selectedItem.displayName || selectedItem.name}</h3>
                <p className="item-modal-price">{formatMoney(selectedItem.price)}</p>
                <div className="item-tag-row">
                  {selectedItem.isNew ? <p className="item-status-badge item-status-badge--new">NEW</p> : null}
                  {selectedItem.isDiscountActive ? (
                    <p className="item-status-badge item-status-badge--discount">{selectedItem.discountLabel}</p>
                  ) : null}
                  {selectedItem.isLimited ? <p className="item-status-badge item-status-badge--limited">LIMITED</p> : null}
                  {selectedItem.originalPrice && selectedItem.originalPrice !== selectedItem.price ? (
                    <p className="item-status-badge item-status-badge--ghost">Was {formatMoney(selectedItem.originalPrice)}</p>
                  ) : null}
                </div>
                <p className="item-modal-description">{selectedItem.description}</p>

                <button
                  className="add-btn"
                  disabled={selectedItem.isAvailable === false}
                  onClick={() => {
                    handleAddToBasket(selectedItem);
                    setSelectedItem(null);
                  }}
                >
                  {selectedItem.isAvailable === false ? "Unavailable" : "Add to Basket"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button className="view-cart-fab" onClick={openMiniCart}>
        View Basket
      </button>
    </div>
  );
}
