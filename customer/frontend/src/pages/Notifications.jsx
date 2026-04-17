import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCustomerNotifications,
  getNotificationTypeLabel,
  markAllNotificationsRead,
  markNotificationRead,
  syncCustomerNotifications
} from "../services/notificationService";
import "./Notifications.css";

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString();
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = async () => {
    setIsLoading(true);
    setError("");
    try {
      await syncCustomerNotifications();
      setItems(getCustomerNotifications());
    } catch (loadError) {
      setError(loadError?.message || "Could not load notifications right now.");
      setItems(getCustomerNotifications());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const onMarkAllRead = () => {
    markAllNotificationsRead();
    setItems(getCustomerNotifications());
  };

  const onOpenItem = (id) => {
    markNotificationRead(id);
    setItems(getCustomerNotifications());
  };

  if (isLoading) return <div className="notifications-state">Loading notifications...</div>;
  if (error) return <div className="notifications-state notifications-error">{error}</div>;

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p>Order updates, loyalty awards, promo alerts, and new menu items are listed here.</p>
        </div>
        {items.length ? (
          <button type="button" onClick={onMarkAllRead} className="notifications-mark-all">
            Mark all as read
          </button>
        ) : null}
      </div>

      {!items.length ? (
        <div className="notifications-state">
          <h2>No notifications yet</h2>
          <p>We will show order updates, loyalty awards, promo alerts, and new item notices here.</p>
          <Link to="/order">Start an order</Link>
        </div>
      ) : (
        <div className="notifications-list">
          {items.map((item) => (
            <article
              key={item.id}
              className={`notification-card ${item.isRead ? "" : "unread"}`}
              onClick={() => onOpenItem(item.id)}
              role="button"
              tabIndex={0}
            >
              <div className="notification-top">
                <span className="notification-type">{getNotificationTypeLabel(item.type)}</span>
                <span className="notification-time">{formatDate(item.createdAt)}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              {item.orderId ? <Link to="/track-order">View related order</Link> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
