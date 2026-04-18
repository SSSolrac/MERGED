// src/components/MenuBelt.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getMenuCatalog, getMenuCategories } from "../services/menuService";
import "./MenuBelt.css";

// Default category images
import coffee from "../assets/coffee.png";
import hot from "../assets/hot.png";
import sandwiches from "../assets/sandwiches.png";
import rice from "../assets/ricemeal.png"; // Added this so your rice meals don't look like hot coffee!

// Specific item images (.jpg based on your folder)
import chocoJavaFrappe from "../assets/Choco Java Chip Frappe.jpg";
import blueberrySoda from "../assets/Blueberry Soda.jpg";

const items = [
  { name: "Cloud Americano", tagLeft: "Iced Coffee", fallbackPrice: 120, img: coffee },
  { name: "Choco Java Chip Frappe", tagLeft: "Frappuccino", fallbackPrice: 170, img: chocoJavaFrappe },
  { name: "Chicken Cordon Bleu", tagLeft: "Rice Meal", fallbackPrice: 180, img: rice },
  { name: "Spanish Latte", tagLeft: "Hot Coffee", fallbackPrice: 120, img: hot },
  { name: "Blueberry Soda", tagLeft: "Non-Caff", fallbackPrice: 90, img: blueberrySoda },
  { name: "Chicken Alfredo Pasta", tagLeft: "Pasta", fallbackPrice: 190, img: sandwiches },
  { name: "Iced Cocoa Tiramisu", tagLeft: "Iced Coffee", fallbackPrice: 160, img: coffee },
  { name: "Burger Steak", tagLeft: "Rice Meal", fallbackPrice: 160, img: rice },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveCategoryId(tagLeft, categories) {
  const tag = normalizeText(tagLeft);
  if (!tag) return "";

  const needles = [];
  if (tag.includes("frap")) needles.push("frapp");
  if (tag.includes("rice")) needles.push("rice");
  if (tag.includes("hot")) needles.push("hot coffee");
  if (tag.includes("iced")) needles.push("iced coffee");
  if (tag.includes("non")) needles.push("non");
  if (tag.includes("pasta") || tag.includes("sandwich")) needles.push("pasta");
  needles.push(tag);

  for (const needle of needles) {
    const match = (Array.isArray(categories) ? categories : []).find((cat) => normalizeText(cat?.name).includes(needle));
    if (match?.id) return String(match.id);
  }

  return "";
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPrice(value) {
  return `₱${asNumber(value, 0).toFixed(0)}`;
}

function formatPriceCompact(value) {
  const amount = asNumber(value, 0);
  return `₱${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
}

function buildDiscountLabel(item, discountAmount) {
  const storedLabel = String(item?.discountLabel || "").trim();
  if (storedLabel) return storedLabel;

  const discountType = String(item?.discountType || "amount").toLowerCase();
  const discountValue = asNumber(item?.discountValue ?? discountAmount, 0);
  if (discountType === "percent" && discountValue > 0) return `${discountValue}% off`;
  return `${formatPriceCompact(discountAmount)} off`;
}

function resolveCatalogItem(itemName, menuCatalog) {
  const key = normalizeText(itemName);
  const catalog = Array.isArray(menuCatalog) ? menuCatalog : [];
  const exactMatch = catalog.find((entry) => normalizeText(entry?.name) === key);
  if (exactMatch) return exactMatch;
  return catalog.find((entry) => {
    const entryName = normalizeText(entry?.name);
    return entryName.includes(key) || key.includes(entryName);
  }) || null;
}

export default function MenuBelt() {
  const navigate = useNavigate();
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuCatalog, setMenuCatalog] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [categoriesResult, catalogResult] = await Promise.allSettled([getMenuCategories(), getMenuCatalog()]);
      if (cancelled) return;

      const categories = categoriesResult.status === "fulfilled" && Array.isArray(categoriesResult.value) ? categoriesResult.value : [];
      const catalog = catalogResult.status === "fulfilled" && Array.isArray(catalogResult.value) ? catalogResult.value : [];

      setMenuCategories(categories);
      setMenuCatalog(catalog);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Duplicate items so the loop looks continuous
  const beltItems = useMemo(() => {
    const pricedItems = items
      .map((item) => {
        const match = resolveCatalogItem(item.name, menuCatalog);
        if (match && match.isAvailable === false) return null;
        const basePrice = asNumber(match?.price, item.fallbackPrice);
        const discountAmount = asNumber(match?.effectiveDiscount ?? match?.discount, 0);
        const effectivePrice = asNumber(match?.effectivePrice, Math.max(basePrice - discountAmount, 0));
        const isDiscountActive = Boolean(match?.isDiscountActive ?? discountAmount > 0);

        return {
          ...item,
          tagRight: formatPrice(effectivePrice),
          originalPrice: basePrice,
          effectivePrice,
          isDiscountActive,
          discountLabel: isDiscountActive ? buildDiscountLabel(match, discountAmount) : "",
        };
      })
      .filter(Boolean);
    return [...pricedItems, ...pricedItems];
  }, [menuCatalog]);

  const handlePick = (picked) => {
    const categoryId = resolveCategoryId(picked?.tagLeft, menuCategories);
    if (!categoryId) {
      navigate("/order");
      return;
    }

    const params = new URLSearchParams();
    if (picked?.name) params.set("focus", String(picked.name));
    const qs = params.toString();

    navigate(`/order/${categoryId}${qs ? `?${qs}` : ""}`);
  };

  return (
    <section className="belt-section">
      <h2 className="belt-title">Cafe Favorites</h2>
      <p className="belt-subtitle">Quick picks from our menu — scroll & discover your next order.</p>

      <div className="belt-viewport">
        <div className="belt-track">
          {beltItems.map((it, idx) => (
            <button
              type="button"
              className="belt-card"
              key={`${it.name}-${idx}`}
              onClick={() => handlePick(it)}
              aria-label={`View ${it.name}`}
            >
              <div className="belt-imgWrap">
                <img src={it.img} alt={it.name} className="belt-img" />
                {it.isDiscountActive ? <span className="belt-card-tag belt-card-tag--discounted">DISCOUNTED</span> : null}
              </div>

              <h3 className="belt-name">{it.name}</h3>

              <div className="belt-tags">
                <span className="tag-category">{it.tagLeft}</span>
                <span className="tag-price">{it.tagRight}</span>
              </div>
              {it.isDiscountActive ? (
                <div className="belt-promo-row">
                  <span className="belt-promo-pill">{it.discountLabel}</span>
                  {it.originalPrice && it.originalPrice !== it.effectivePrice ? (
                    <span className="belt-was-price">Was {formatPrice(it.originalPrice)}</span>
                  ) : null}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="belt-ctaRow">
        <Link className="belt-ctaBtn" to="/order">
          Order Now
        </Link>
      </div>
    </section>
  );
}
