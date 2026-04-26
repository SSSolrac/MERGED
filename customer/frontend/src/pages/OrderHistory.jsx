import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOrderCancellationReason,
  getOrderCancellationState,
  getOrderHistory,
  getOrderReference,
  getStatusLabel,
} from "../services/orderService";
import "./OrderHistory.css";

const ORDERS_PER_PAGE = 10;

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
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await getOrderHistory();
        setOrders(result);
        setPageIndex(0);
        setExpandedId("");
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

  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePageIndex * ORDERS_PER_PAGE;
  const visibleOrders = orders.slice(pageStart, pageStart + ORDERS_PER_PAGE);

  return (
    <div className="history-page">
      <h1>Order History</h1>
      <p className="history-subtitle">
        Showing {orders.length > ORDERS_PER_PAGE ? `orders ${pageStart + 1}-${Math.min(pageStart + ORDERS_PER_PAGE, orders.length)} of ${orders.length}` : "your latest order activity"}.
      </p>
      <div className="history-list">
        {visibleOrders.map((order) => {
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
                <div>
                  <h3>{getOrderReference(order)}</h3>
                  <p className="history-date">{formatDateTime(order.placedAt || order.createdAt)}</p>
                </div>
                <span className="status-pill">{getStatusLabel(order.status)}</span>
              </div>

              <div className="history-summary-grid">
                <div>
                  <span>Customer</span>
                  <strong>{order.customerName || order.deliveryAddress?.name || "Guest"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{getStatusLabel(order.status)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(order.totalAmount)}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{String(order.paymentStatus || "pending")} - {order.paymentMethodLabel || "Not set"}</strong>
                </div>
              </div>
              <p className="history-items-summary">
                {order.orderTypeLabel} - {totalItemQuantity} {itemLabel}
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
                <div className="history-detail-panel">
                  <h4>Order items</h4>
                <ul>
                  {orderItems.map((item) => (
                    <li key={item.id}>{item.itemName} x {item.quantity} - {formatMoney(item.lineTotal)}</li>
                  ))}
                </ul>
                  <div className="history-detail-totals">
                    <span>Subtotal: {formatMoney(order.subtotal)}</span>
                    <span>Discount: -{formatMoney(order.discountTotal)}</span>
                    <strong>Total: {formatMoney(order.totalAmount)}</strong>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {orders.length > ORDERS_PER_PAGE ? (
        <div className="history-pagination" aria-label="Order history pagination">
          <button
            type="button"
            disabled={safePageIndex === 0}
            onClick={() => {
              setExpandedId("");
              setPageIndex((prev) => Math.max(prev - 1, 0));
            }}
          >
            Previous
          </button>
          <span>Page {safePageIndex + 1} of {totalPages}</span>
          <button
            type="button"
            disabled={safePageIndex >= totalPages - 1}
            onClick={() => {
              setExpandedId("");
              setPageIndex((prev) => Math.min(prev + 1, totalPages - 1));
            }}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
