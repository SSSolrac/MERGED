import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowClockwise, BellFill, Check2All, XLg } from "react-bootstrap-icons";
import {
  getCustomerNotifications,
  getNotificationTypeLabel,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  syncCustomerNotifications,
} from "../services/notificationService";
import { useAuth } from "../context/AuthContext";
import "./MiniNotificationsPanel.css";

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString();
}

export default function MiniNotificationsPanel({ onClose, onUnreadCountChange }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const syncUnreadCount = useCallback(() => {
    onUnreadCountChange?.(getUnreadNotificationCount());
  }, [onUnreadCountChange]);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      // Guests track a specific order from Track Order, not account notifications.
      setItems([]);
      setIsLoading(false);
      onClose?.();
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      await syncCustomerNotifications();
      setItems(getCustomerNotifications());
    } catch (loadError) {
      setError(loadError?.message || "Could not load notifications right now.");
      setItems(getCustomerNotifications());
    } finally {
      syncUnreadCount();
      setIsLoading(false);
    }
  }, [isAuthenticated, onClose, syncUnreadCount]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    setItems(getCustomerNotifications());
    syncUnreadCount();
  };

  const handleOpenItem = (item) => {
    markNotificationRead(item?.id);
    setItems(getCustomerNotifications());
    syncUnreadCount();
  };

  const handleTrackOrder = (item) => {
    handleOpenItem(item);
    onClose?.();
    navigate("/track-order");
  };

  const handleStartOrder = () => {
    onClose?.();
    navigate("/order");
  };

  return (
    <div className="mini-notifications-panel" role="dialog" aria-label="Notifications">
      <div className="mini-notifications-header">
        <h2 className="mini-notifications-title">Notifications</h2>
        <div className="mini-notifications-actions">
          {items.length ? (
            <button type="button" className="mini-notifications-action" onClick={handleMarkAllRead}>
              <Check2All style={{ marginRight: 6 }} />
              Mark all
            </button>
          ) : null}
          <button type="button" className="mini-notifications-action" onClick={loadNotifications}>
            <ArrowClockwise style={{ marginRight: 6 }} />
            Refresh
          </button>
          <button type="button" className="mini-notifications-close" onClick={onClose} aria-label="Close notifications">
            <XLg />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mini-notifications-state">Loading notifications...</div>
      ) : error ? (
        <div className="mini-notifications-state mini-notifications-error">{error}</div>
      ) : !items.length ? (
        <div className="mini-notifications-state">
          <div className="mini-notifications-state-icon" aria-hidden="true">
            <BellFill />
          </div>
          <p>No notifications yet.</p>
          <div className="mini-notifications-bottom">
            <button type="button" className="mini-notifications-primary" onClick={handleStartOrder}>
              Start an Order
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mini-notifications-list">
            {items.map((item) => (
              <article
                key={item.id}
                className={`mini-notification-card${item.isRead ? "" : " mini-notification-card--unread"}`}
              >
                <div className="mini-notification-top">
                  <span className="mini-notification-type">{getNotificationTypeLabel(item.type)}</span>
                  <span className="mini-notification-time">{formatDate(item.createdAt)}</span>
                </div>

                <h3>{item.title}</h3>
                <p>{item.message}</p>

                <div className="mini-notification-footer">
                  {item.orderId ? (
                    <button type="button" className="mini-notifications-link" onClick={() => handleTrackOrder(item)}>
                      View related order
                    </button>
                  ) : <span />}

                  {!item.isRead ? (
                    <button type="button" className="mini-notifications-read" onClick={() => handleOpenItem(item)}>
                      Mark read
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
