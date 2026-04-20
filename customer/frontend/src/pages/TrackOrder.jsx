import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOrderTracking } from "../hooks/useOrderTracking";
import {
  cancelOrder,
  getOrderCancellationReason,
  getOrderCancellationState,
  getOrderReference,
  getStatusLabel,
} from "../services/orderService";
import { syncCustomerNotifications } from "../services/notificationService";
import { useAuth } from "../context/AuthContext";
import "./TrackOrder.css";

function formatTimestamp(value) {
  if (!value) return "Waiting for update";
  return new Date(value).toLocaleString();
}

export default function TrackOrder() {
  const { isAuthenticated } = useAuth();
  const { order, isLoading, error, steps, currentStepIndex, loadLatest, lookupByOrderId } = useOrderTracking();
  const [searchId, setSearchId] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!order || !isAuthenticated) return;
    syncCustomerNotifications();
  }, [isAuthenticated, order]);

  const cancellationState = useMemo(() => getOrderCancellationState(order), [order]);
  const cancellationReason = useMemo(() => getOrderCancellationReason(order), [order]);
  const orderItems = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order?.items]);

  const activeTimeline = useMemo(() => {
    const timelineMap = new Map(
      (order?.statusTimeline || []).map((entry) => [entry.status, { at: entry.at, note: entry.note }])
    );

    return steps.map((step, index) => {
      const timelineEntry = timelineMap.get(step) || {};
      return {
        step,
        at: timelineEntry.at || null,
        note: String(timelineEntry.note || "").trim(),
        state: index < currentStepIndex ? "complete" : index === currentStepIndex ? "current" : "upcoming",
      };
    });
  }, [order?.statusTimeline, steps, currentStepIndex]);

  const handleLookup = async (event) => {
    event.preventDefault();
    if (!searchId.trim()) return;
    setActionMessage("");
    await lookupByOrderId(searchId);
  };

  const handleCancelOrder = async () => {
    if (!order || !cancellationState.canCancel) return;
    setCancelling(true);
    setActionMessage("");

    try {
      await cancelOrder(order);
      await loadLatest();
      await syncCustomerNotifications();
      setActionMessage("Order cancelled successfully.");
    } catch (cancelError) {
      setActionMessage(cancelError.message || "Unable to cancel this order right now.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="track-page">
      <div className="track-header">
        <h1>Track Your Order</h1>
        <p>Track by order ID or code, or pull your latest order on this account.</p>
      </div>

      <form className="track-lookup" onSubmit={handleLookup}>
        <input
          type="text"
          value={searchId}
          onChange={(event) => setSearchId(event.target.value.toUpperCase())}
          placeholder="Enter order code or ID (e.g., ORD-20260101-101)"
          aria-label="Order ID or code"
        />
        <button type="submit" disabled={isLoading}>Find Order</button>
        <button type="button" disabled={isLoading} onClick={loadLatest}>Refresh Latest</button>
      </form>

      {isLoading ? <div className="track-state">Checking your latest order updates...</div> : null}
      {!isLoading && error ? <div className="track-state track-error">{error}</div> : null}

      {!isLoading && !error && !order ? (
        <div className="track-state">
          <h2>No Active Order Found</h2>
          <p>Place an order first, or enter your order ID above.</p>
          <Link to="/order">Go to Menu</Link>
        </div>
      ) : null}

      {!isLoading && order ? (
        <>
          <div className="track-order-card">
            <div className="track-order-row">
              <h2>{order.statusLabel || getStatusLabel(order.status)}</h2>
              <span className="track-pill">{order.orderTypeLabel}</span>
            </div>
            <p><strong>Order:</strong> {getOrderReference(order)}</p>
            <p><strong>Placed:</strong> {formatTimestamp(order.placedAt || order.createdAt)}</p>
            <p><strong>Last update:</strong> {formatTimestamp(order.updatedAt)}</p>
            <p><strong>Payment:</strong> {String(order.paymentStatus || "pending")} | {order.paymentMethodLabel}</p>
            <p><strong>Total:</strong> PHP {Number(order.totalAmount || 0).toFixed(2)}</p>
            <p><strong>Items:</strong> {orderItems.map((item) => `${item.itemName} x ${item.quantity}`).join(", ") || "No items found"}</p>
            {order.status === "cancelled" && cancellationReason ? (
              <p className="track-cancel-reason"><strong>Cancellation reason:</strong> {cancellationReason}</p>
            ) : null}

            <div className="track-cancel-panel">
              <h3>Need to cancel?</h3>
              {cancellationState.canCancel ? (
                <p className="track-cancel-info">
                  Cancellation is available while your order is still <strong>Pending</strong>. Once it is marked <strong>Preparing</strong>, cancellation is disabled.
                </p>
              ) : (
                <p className="track-cancel-expired">{cancellationState.reason || "Cancellation is unavailable for this order."}</p>
              )}
              <button type="button" onClick={handleCancelOrder} disabled={!cancellationState.canCancel || cancelling}>
                {cancelling ? "Cancelling..." : "Cancel order"}
              </button>
              {actionMessage ? <p className="track-meta">{actionMessage}</p> : null}
            </div>
          </div>

          <div className="track-timeline">
            {activeTimeline.map(({ step, at, note, state }) => (
              <div className="timeline-row" key={step}>
                <div className={`timeline-dot ${state !== "upcoming" ? "active" : ""}`}>
                  {state === "complete" ? "OK" : ""}
                </div>
                <div>
                  <p className={state !== "upcoming" ? "active" : ""}>{getStatusLabel(step)}</p>
                  <small>{at ? `Updated ${formatTimestamp(at)}` : "Awaiting this stage"}</small>
                  {note ? <small className="track-status-note">Note: {note}</small> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="track-actions">
        {isAuthenticated ? <Link to="/order-history">View order history</Link> : <Link to="/order">Start another order</Link>}
      </div>
    </div>
  );
}
