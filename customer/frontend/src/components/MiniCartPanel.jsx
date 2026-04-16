import { useNavigate } from "react-router-dom";
import { BagFill, XLg } from "react-bootstrap-icons";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import "./MiniCartPanel.css";

function formatCurrency(value) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

export default function MiniCartPanel({ onClose, onOpenAuth }) {
  const navigate = useNavigate();
  const { cart, total, changeQty, removeItem, clearCart } = useCart();
  const { isAuthenticated } = useAuth();

  const handleContinueOrdering = () => {
    onClose();
    navigate("/order");
  };

  const handleCheckout = () => {
    onClose();

    if (!isAuthenticated) {
      onOpenAuth?.();
      return;
    }

    navigate("/checkout");
  };

  return (
    <div className="mini-cart-panel" role="dialog" aria-label="Basket preview">
      <div className="mini-cart-header">
        <h2 className="mini-cart-title">Your Basket</h2>
        <div className="mini-cart-actions">
          {cart.length ? (
            <button type="button" className="mini-cart-clear" onClick={clearCart}>
              Clear
            </button>
          ) : null}
          <button type="button" className="mini-cart-close" onClick={onClose} aria-label="Close basket">
            <XLg />
          </button>
        </div>
      </div>

      {!cart.length ? (
        <div className="mini-cart-empty">
          <div className="mini-cart-empty-icon" aria-hidden="true"><BagFill /></div>
          <p>Your basket is empty right now.</p>
          <button type="button" className="mini-cart-primary" onClick={handleContinueOrdering}>
            Start Ordering
          </button>
        </div>
      ) : (
        <>
          <div className="mini-cart-list">
            {cart.map((item) => (
              <div className="mini-cart-item" key={item.id}>
                <img className="mini-cart-image" src={item.image} alt={item.displayName || item.name} />
                <div className="mini-cart-item-body">
                  <h3 className="mini-cart-item-name">{item.displayName || item.name}</h3>
                  <p className="mini-cart-item-price">{formatCurrency(item.price)}</p>

                  <div className="mini-cart-item-footer">
                    <div className="mini-cart-qty" aria-label={`Quantity for ${item.displayName || item.name}`}>
                      <button type="button" onClick={() => changeQty(item.id, -1)} aria-label={`Decrease quantity for ${item.displayName || item.name}`}>
                        -
                      </button>
                      <span className="mini-cart-qty-value">{item.qty}</span>
                      <button type="button" onClick={() => changeQty(item.id, 1)} aria-label={`Increase quantity for ${item.displayName || item.name}`}>
                        +
                      </button>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <p className="mini-cart-item-total">{formatCurrency(Number(item.price || 0) * Number(item.qty || 0))}</p>
                      <button type="button" className="mini-cart-remove" onClick={() => removeItem(item.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mini-cart-summary">
            <div className="mini-cart-summary-row">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <p className="mini-cart-summary-note">Review your order here, then head straight to checkout.</p>
          </div>

          <div className="mini-cart-buttons">
            <button type="button" className="mini-cart-primary" onClick={handleCheckout}>
              {isAuthenticated ? "Checkout" : "Sign In to Checkout"}
            </button>
            <button type="button" className="mini-cart-secondary" onClick={handleContinueOrdering}>
              Add More Items
            </button>
          </div>
        </>
      )}
    </div>
  );
}
