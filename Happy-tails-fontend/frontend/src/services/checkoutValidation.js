import { labelToCanonicalOrderType, labelToCanonicalPaymentMethod } from "../constants/canonical.js";
import { DELIVERY_BASE_FEE, normalizeLatLngPoint } from "./deliveryFeeService.js";
import { getOrderWindowStatus } from "../utils/orderAvailability.js";

function isLoyaltyRewardCartItem(item) {
  return Boolean(item?.isLoyaltyReward || item?.loyaltyRewardItemId || item?.loyalty_reward_item_id);
}

export async function validateCheckout(orderPayload) {
  const errors = {};
  const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];

  if (!items.length) {
    errors.items = "Your cart is empty.";
  } else {
    const hasMissingItemCode = items.some((item) => {
      const code = String(item?.code || item?.menuItemCode || item?.menu_item_code || "").trim();
      return !code;
    });
    if (hasMissingItemCode) {
      errors.items = "Every cart item must include a valid menu item code. Remove and re-add items from the menu.";
    }
  }

  const hasLoyaltyRewardItems = items.some(isLoyaltyRewardCartItem);
  const hasRegularOrderItems = items.some((item) => !isLoyaltyRewardCartItem(item));
  if (hasLoyaltyRewardItems && !hasRegularOrderItems) {
    errors.form = "Free latte rewards cannot be checked out on their own. Add at least one regular menu item.";
  }

  if (!orderPayload.customer?.name?.trim()) errors.name = "Name is required.";
  const phone = String(orderPayload.customer?.phone || "").trim();
  if (!phone) {
    errors.phone = "Phone number is required.";
  } else if (!/^\+639\d{9}$/.test(phone)) {
    errors.phone = "Use a valid PH mobile number (e.g., +639123456789).";
  }
  const canonicalOrderType = labelToCanonicalOrderType(orderPayload.orderType || "");
  if (canonicalOrderType === "delivery" && !orderPayload.customer?.address?.trim()) {
    errors.address = "Address is required for delivery.";
  }
  if (canonicalOrderType === "delivery") {
    const deliveryMeta = orderPayload.deliveryMeta && typeof orderPayload.deliveryMeta === "object" ? orderPayload.deliveryMeta : {};
    if (!String(deliveryMeta.selectedPurokId || "").trim()) {
      errors.purok = "Select an active purok for delivery.";
    }

    const latitude = Number(deliveryMeta.latitude);
    const longitude = Number(deliveryMeta.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      errors.mapPin = "Place a valid delivery pin on the map.";
    }

    const deliveryFee = Number(deliveryMeta.deliveryFee);
    const distanceKm = Number(deliveryMeta.distanceKm);
    const pickupLatLng = normalizeLatLngPoint(deliveryMeta.pickupLatLng);
    const dropoffLatLng = normalizeLatLngPoint(deliveryMeta.dropoffLatLng);
    if (!Number.isFinite(deliveryFee) || deliveryFee < DELIVERY_BASE_FEE) {
      errors.deliveryFee = "Delivery fee is still being calculated. Please confirm a valid map pin.";
    } else if (!Number.isFinite(distanceKm) || distanceKm < 0 || !pickupLatLng || !dropoffLatLng) {
      errors.deliveryFee = "Delivery distance metadata is incomplete. Please place the pin again.";
    }
  }

  const paymentMethod = labelToCanonicalPaymentMethod(orderPayload.paymentMethod || orderPayload.payment);
  if (!["qrph", "gcash", "maribank", "bdo", "cash"].includes(paymentMethod || "")) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  const requiresReceipt = paymentMethod !== "cash";
  if (requiresReceipt && !String(orderPayload.receiptImageUrl || "").trim()) {
    errors.receipt = "Receipt upload is required.";
  }

  const orderWindowStatus = getOrderWindowStatus(
    orderPayload.placedAt || orderPayload.currentDate,
    orderPayload.businessSettings || orderPayload.checkoutSettings || orderPayload.kitchenCutoff
  );
  if (!orderWindowStatus.isOpen && !errors.form) {
    errors.form = orderWindowStatus.message;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}
