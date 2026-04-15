import { labelToCanonicalPaymentMethod } from "../constants/canonical.js";

export async function validateCheckout(orderPayload) {
  const errors = {};

  if (!orderPayload.items?.length) {
    errors.items = "Your cart is empty.";
  } else {
    const hasMissingItemCode = orderPayload.items.some((item) => {
      const code = String(item?.code || item?.menuItemCode || item?.menu_item_code || "").trim();
      return !code;
    });
    if (hasMissingItemCode) {
      errors.items = "Every cart item must include a valid menu item code. Remove and re-add items from the menu.";
    }
  }
  if (!orderPayload.customer?.name?.trim()) errors.name = "Name is required.";
  const phone = String(orderPayload.customer?.phone || "").trim();
  if (!phone) {
    errors.phone = "Phone number is required.";
  } else if (!/^\+639\d{9}$/.test(phone)) {
    errors.phone = "Use a valid PH mobile number (e.g., +639123456789).";
  }
  if (!orderPayload.customer?.address?.trim()) errors.address = "Address is required.";

  const paymentMethod = labelToCanonicalPaymentMethod(orderPayload.paymentMethod || orderPayload.payment);
  if (!["qrph", "gcash", "maribank", "bdo", "cash"].includes(paymentMethod || "")) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  const requiresReceipt = paymentMethod !== "cash";
  if (requiresReceipt && !String(orderPayload.receiptImageUrl || "").trim()) {
    errors.receipt = "Receipt upload is required.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
