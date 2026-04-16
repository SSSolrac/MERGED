import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOrderCancellationReason,
  getOrderCancellationState,
  getOrderHistory,
  getStatusLabel,
} from "../services/orderService";
import "./OrderHistory.css";

function formatMoney(value) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await getOrderHistory();
        setOrders(result);
      } catch (loadError) {
        setError(loadError?.message || "Unable to load your order history right now. Please try again shortly.");
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, []);

  if (isLoading) return <div className="history-state">Loading your order history...</div>;
  if (error) return <div className="history-state history-error">{error}</div>;

  if (!orders.length) {
    return (
      <div className="history-state">
        <h2>No orders yet</h2>
        <p>Once you place your first order, your timeline and receipts will appear here.</p>
        <Link to="/order">Start an order</Link>
      </div>
    );
  }

  return (
    <div className="history-page">
      <h1>Order History</h1>
      <p className="history-subtitle">Your account-specific order activity is listed below.</p>
      <div className="history-list">
        {orders.map((order) => {
          const isExpanded = expandedId === order.id;
          const orderItems = Array.isArray(order.items) ? order.items : [];
          const totalItemQuantity = orderItems.reduce((sum, item) => {
            const quantity = Number(item.quantity ?? 1);
            return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
          }, 0);
          const itemLabel = totalItemQuantity === 1 ? "item" : "items";
          const cancellationReason = getOrderCancellationReason(order);

          return (
            <article key={order.id} className="history-card">
              <div className="history-row">
                <h3>{order.code || order.id}</h3>
                <span className="status-pill">{getStatusLabel(order.status)}</span>
              </div>

              <p>Placed: {formatDateTime(order.placedAt || order.createdAt)}</p>
              <p>Payment: {String(order.paymentStatus || "pending")} | {order.paymentMethodLabel}</p>
              <p>
                {order.orderTypeLabel} | {order.paymentMethodLabel} | {totalItemQuantity} {itemLabel} | <strong>{formatMoney(order.totalAmount)}</strong>
              </p>
              {(() => {
                const cancellationState = getOrderCancellationState(order);
                if (cancellationState.canCancel) {
                  return <p className="history-items-summary">Can be cancelled while order is still pending.</p>;
                }
                return <p className="history-items-summary">{cancellationState.reason}</p>;
              })()}

              {order.status === "cancelled" && cancellationReason ? (
                <p className="history-cancel-reason"><strong>Cancellation reason:</strong> {cancellationReason}</p>
              ) : null}

              <p className="history-items-summary">
                {orderItems.slice(0, 2).map((item) => `${item.itemName} x ${item.quantity}`).join(", ")}
                {orderItems.length > 2 ? ` +${orderItems.length - 2} more` : ""}
              </p>

              <div className="history-actions">
                <button type="button" onClick={() => setExpandedId(isExpanded ? "" : order.id)}>
                  {isExpanded ? "Hide details" : "View details"}
                </button>
                <Link to="/track-order">Track status</Link>
              </div>

              {isExpanded ? (
                <ul>
                  {orderItems.map((item) => (
                    <li key={item.id}>{item.itemName} x {item.quantity} - {formatMoney(item.lineTotal)}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
