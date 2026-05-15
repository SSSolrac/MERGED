import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLatestOrder, getOrderReference } from "../services/orderService";

export default function OrderSuccess({ linkComponent: LinkComponent }) {
  const [latestOrderRef, setLatestOrderRef] = useState("");
  const renderLink = (path, label, style) =>
    LinkComponent ? (
      <LinkComponent href={path} style={style}>
        {label}
      </LinkComponent>
    ) : (
      <Link to={path} style={style}>
        {label}
      </Link>
    );

  useEffect(() => {
    const loadLatest = async () => {
      try {
        const latest = await getLatestOrder();
        if (latest?.id) setLatestOrderRef(getOrderReference(latest));
      } catch {
        setLatestOrderRef("");
      }
    };

    loadLatest();
  }, []);

  return (
    <div style={{ padding: 48, textAlign: "center", minHeight: "60vh" }}>
      <div style={{ fontSize: "5rem" }}>🎉</div>
      <h1 style={{ color: "#ff4d94" }}>Order Confirmed</h1>
      <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>
        Thank you. Your order was received and sent to the café team.
      </p>
      <p style={{ marginBottom: 24, color: "#555" }}>
        {latestOrderRef ? `Order reference: ${latestOrderRef}` : "Your order reference will appear in Track Order shortly."}
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", flexWrap: "wrap" }}>
        {renderLink("/track-order", "Track My Order", {
          padding: "12px 24px",
          backgroundColor: "#ff8fa3",
          color: "white",
          textDecoration: "none",
          borderRadius: "8px",
          fontWeight: "bold"
        })}
        {renderLink("/order-history", "View History", {
          padding: "12px 24px",
          border: "2px solid #36d7e8",
          color: "#167888",
          textDecoration: "none",
          borderRadius: "8px",
          fontWeight: "bold"
        })}
        {renderLink("/order", "Order Again", {
          padding: "12px 24px",
          border: "2px solid #ff4d94",
          color: "#ff4d94",
          textDecoration: "none",
          borderRadius: "8px",
          fontWeight: "bold"
        })}
      </div>
    </div>
  );
}
