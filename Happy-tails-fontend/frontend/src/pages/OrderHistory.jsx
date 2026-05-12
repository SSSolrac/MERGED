import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getReviewCandidateOrder } from "../services/reviewService";
import {
  getOrderCancellationReason,
  getOrderCancellationState,
  getOrderHistoryPage,
  getOrderReference,
  getStatusLabel,
  getStatusSteps,
} from "../services/orderService";
import ReviewPrompt from "../components/ReviewPrompt";
import "./OrderHistory.css";

const ORDERS_PER_PAGE = 5;
const STATUS_FILTERS = ["all", "pending", "preparing", "ready", "out_for_delivery", "completed", "delivered", "cancelled", "refunded"];

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
  const [pageIndex, setPageIndex] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [totalOrders, setTotalOrders] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setIsLoading(true);
      setError("");
      try {
        const result = await getOrderHistoryPage({ page: pageIndex, pageSize: ORDERS_PER_PAGE, status: statusFilter });
        if (cancelled) return;
        setOrders(result.orders);
        setTotalOrders(result.total);
        setExpandedId("");
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError?.message || "Unable to load your order history right now. Please try again shortly.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [pageIndex, statusFilter]);

  useEffect(() => {
    setPageIndex(1);
  }, [statusFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PER_PAGE));
    if (pageIndex > totalPages) setPageIndex(totalPages);
  }, [pageIndex, totalOrders]);

  if (isLoading) return <div className="history-state">Loading your order history...</div>;
  if (error) return <div className="history-state history-error">{error}</div>;

  const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PER_PAGE));
  const safePageIndex = Math.max(0, pageIndex - 1);
  const visibleOrders = orders;
  const reviewPromptOrder = getReviewCandidateOrder(visibleOrders);
  const pageStart = totalOrders === 0 ? 0 : (pageIndex - 1) * ORDERS_PER_PAGE + 1;
  const pageEnd = Math.min(pageIndex * ORDERS_PER_PAGE, totalOrders);

  return (
    <div className="history-page">
      <div className="history-header">
        <div>
          <p className="history-eyebrow">Your purchases</p>
          <h1>Order History</h1>
          <p className="history-subtitle">
            {totalOrders ? `Showing ${pageStart}-${pageEnd} of ${totalOrders} orders.` : "Your timeline and receipts will appear here."}
          </p>
        </div>
        <Link className="history-primary-link" to="/order">
          Start an order
        </Link>
      </div>

      <div className="history-toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : getStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!orders.length ? (
        <div className="history-state history-empty">
          <h2>{statusFilter === "all" ? "No orders yet" : `No ${getStatusLabel(statusFilter).toLowerCase()} orders`}</h2>
          <p>Try another status filter or place a new order when you are ready.</p>
        </div>
      ) : null}

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
          const steps = getStatusSteps(order.orderType);
          const activeStepIndex = Math.max(0, steps.indexOf(order.status));

          return (
            <article key={order.id} className="history-card">
              <div className="history-row">
                <div>
                  <h3>{getOrderReference(order)}</h3>
                  <p className="history-date">{formatDateTime(order.placedAt || order.createdAt)}</p>
                </div>
                <span className={`status-pill status-pill--${order.status}`}>{getStatusLabel(order.status)}</span>
              </div>

              <div className="history-progress" aria-label="Order status timeline">
                {steps.map((step, index) => (
                  <span key={step} className={`history-progress-step ${index <= activeStepIndex ? "history-progress-step--active" : ""}`}>
                    {getStatusLabel(step)}
                  </span>
                ))}
              </div>

              <div className="history-summary-grid">
                <div>
                  <span>Customer</span>
                  <strong>{order.customerName || order.deliveryAddress?.name || "Guest"}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(order.totalAmount)}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>
                    {String(order.paymentStatus || "pending")} - {order.paymentMethodLabel || "Not set"}
                  </strong>
                </div>
                <div>
                  <span>Type</span>
                  <strong>{order.orderTypeLabel}</strong>
                </div>
              </div>

              <p className="history-items-summary">
                {totalItemQuantity} {itemLabel}: {orderItems.slice(0, 2).map((item) => `${item.itemName} x ${item.quantity}`).join(", ")}
                {orderItems.length > 2 ? ` +${orderItems.length - 2} more` : ""}
              </p>

              {(() => {
                const cancellationState = getOrderCancellationState(order);
                return <p className="history-note">{cancellationState.canCancel ? "Can be cancelled while order is still pending." : cancellationState.reason}</p>;
              })()}

              {order.status === "cancelled" && cancellationReason ? (
                <p className="history-cancel-reason">
                  <strong>Cancellation reason:</strong> {cancellationReason}
                </p>
              ) : null}

              <div className="history-actions">
                <button type="button" onClick={() => setExpandedId(isExpanded ? "" : order.id)}>
                  {isExpanded ? "Hide details" : "View details"}
                </button>
                <Link to="/track-order">Track status</Link>
              </div>

              {isExpanded ? (
                <div className="history-detail-panel">
                  <div>
                    <h4>Order items</h4>
                    <ul>
                      {orderItems.map((item) => (
                        <li key={item.id}>
                          {item.itemName} x {item.quantity} - {formatMoney(item.lineTotal)}
                        </li>
                      ))}
                    </ul>
                  </div>
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

      {totalOrders > ORDERS_PER_PAGE ? (
        <div className="history-pagination" aria-label="Order history pagination">
          <button
            type="button"
            disabled={pageIndex === 1}
            onClick={() => {
              setExpandedId("");
              setPageIndex((prev) => Math.max(prev - 1, 1));
            }}
          >
            Previous
          </button>
          <span>
            Page {safePageIndex + 1} of {totalPages}
          </span>
          <button
            type="button"
            disabled={pageIndex >= totalPages}
            onClick={() => {
              setExpandedId("");
              setPageIndex((prev) => Math.min(prev + 1, totalPages));
            }}
          >
            Next
          </button>
        </div>
      ) : null}

      <ReviewPrompt order={reviewPromptOrder} />
    </div>
  );
}
