import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { getLatestOrder } from "../services/orderService";

function normalizeStatus(value) {
  return String(value || "pending").trim().toLowerCase();
}

function getActiveOrderCardTitle(order) {
  const status = normalizeStatus(order?.status);
  if (status === "completed") return "Order Completed";
  if (status === "delivered") return "Order Delivered";
  if (status === "cancelled") return "Order Cancelled";
  if (status === "refunded") return "Order Refunded";
  return "Order in Progress";
}

function getActiveOrderCtaLabel(order) {
  const status = normalizeStatus(order?.status);
  if (status === "completed" || status === "delivered" || status === "cancelled" || status === "refunded") {
    return "View Order Status";
  }
  return "Track My Order";
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

export default function Cart() {
  const navigate = useNavigate();
  const { cart, changeQty, removeItem, total, clearCart } = useCart();
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    const loadLatestOrder = async () => {
      try {
        const latestOrder = await getLatestOrder();
        setActiveOrder(latestOrder);
      } catch {
        setActiveOrder(null);
      }
    };

    loadLatestOrder();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Your Cart</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/order" style={{ textDecoration: "none" }}>Add more</Link>
          {cart.length > 0 && <button onClick={clearCart}>Clear</button>}
        </div>
      </div>

      {cart.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          {activeOrder ? (
            <div
              style={{
                background: "white",
                padding: "30px",
                borderRadius: "20px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                border: "1px solid #eee",
              }}
            >
              <div style={{ fontSize: "40px" }}>Order</div>
              <h2 style={{ marginBottom: 8 }}>{getActiveOrderCardTitle(activeOrder)}</h2>
              <p style={{ color: "#666", marginBottom: 20 }}>
                Order <strong>#{activeOrder.code || activeOrder.id}</strong> is currently <strong>{activeOrder.statusLabel || activeOrder.status}</strong>.
              </p>
              <button
                onClick={() => navigate("/track-order")}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#36d7e8",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  width: "100%",
                  maxWidth: "300px",
                }}
              >
                {getActiveOrderCtaLabel(activeOrder)}
              </button>
            </div>
          ) : (
            <>
              <p>Your cart is empty.</p>
              <Link to="/order">Go to Order</Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {cart.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "white",
                  borderRadius: 14,
                  padding: 12,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                }}
              >
                <img src={item.image} alt={item.displayName || item.name} style={{ width: 70, height: 70, borderRadius: 12, objectFit: "cover" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>{item.displayName || item.name}</div>
                  <div style={{ opacity: 0.7 }}>
                    {item.isLoyaltyReward ? "Free reward item" : formatMoney(item.price)}
                  </div>
                </div>
                {item.isLoyaltyReward ? (
                  <div style={{ minWidth: 110, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#7b4f2b" }}>
                    1 free drink
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => changeQty(item.id, -1)}>-</button>
                    <div style={{ width: 24, textAlign: "center" }}>{item.qty}</div>
                    <button onClick={() => changeQty(item.id, 1)}>+</button>
                  </div>
                )}
                <div style={{ width: 120, textAlign: "right", fontWeight: 900 }}>
                  {item.isLoyaltyReward ? "FREE" : formatMoney(Number(item.price || 0) * Number(item.qty || 0))}
                </div>
                <button onClick={() => removeItem(item.id)}>Remove</button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, textAlign: "right", fontSize: 18, fontWeight: 900 }}>Total: {formatMoney(total)}</div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              onClick={() => navigate("/checkout")}
              style={{ fontWeight: 900, padding: "10px 14px", backgroundColor: "#36d7e8", border: "none", borderRadius: "8px", cursor: "pointer" }}
            >
              Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
