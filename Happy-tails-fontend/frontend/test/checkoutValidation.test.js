import test from "node:test";
import assert from "node:assert/strict";

import { validateCheckout } from "../src/services/checkoutValidation.js";
import { DELIVERY_PICKUP_POINT } from "../src/services/deliveryFeeService.js";

function basePayload(overrides = {}) {
  return {
    orderType: "takeout",
    paymentMethod: "cash",
    items: [{ id: "1", code: "ITEM-1", name: "Latte", qty: 1, price: 100 }],
    customer: { name: "Test User", phone: "+639171234567", address: "Pasig City" },
    receiptImageUrl: "data:image/png;base64,ZmFrZQ==",
    currentDate: "2026-04-20T02:00:00.000Z",
    ...overrides,
  };
}

function baseDeliveryMeta(overrides = {}) {
  return {
    selectedPurokId: "purok-1",
    latitude: 13.9442,
    longitude: 121.6114,
    deliveryFee: 49,
    distanceKm: 1.4,
    pickupLatLng: {
      lat: DELIVERY_PICKUP_POINT.lat,
      lng: DELIVERY_PICKUP_POINT.lng,
    },
    dropoffLatLng: {
      lat: 13.9442,
      lng: 121.6114,
    },
    ...overrides,
  };
}

test("address is required for delivery", async () => {
  const payload = basePayload({
    orderType: "delivery",
    customer: { name: "A", phone: "+639171234567", address: "" },
  });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.address);
});

test("address is optional for pickup, takeout, and dine-in", async () => {
  const pickup = await validateCheckout(
    basePayload({ orderType: "pickup", customer: { name: "A", phone: "+639171234567", address: "" } })
  );
  assert.equal(pickup.isValid, true);
  assert.equal(Boolean(pickup.errors.address), false);

  const takeout = await validateCheckout(
    basePayload({ orderType: "takeout", customer: { name: "A", phone: "+639171234567", address: "" } })
  );
  assert.equal(takeout.isValid, true);
  assert.equal(Boolean(takeout.errors.address), false);

  const dineIn = await validateCheckout(
    basePayload({ orderType: "dine_in", customer: { name: "A", phone: "+639171234567", address: "" } })
  );
  assert.equal(dineIn.isValid, true);
  assert.equal(Boolean(dineIn.errors.address), false);
});

test("delivery requires active purok + map pin metadata", async () => {
  const payload = basePayload({
    orderType: "delivery",
    customer: { name: "A", phone: "+639171234567", address: "Lucena City" },
    deliveryMeta: {},
  });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.purok);
  assert.ok(result.errors.mapPin);
});

test("delivery requires fee and distance metadata", async () => {
  const payload = basePayload({
    orderType: "delivery",
    customer: { name: "A", phone: "+639171234567", address: "Lucena City" },
    deliveryMeta: baseDeliveryMeta({
      deliveryFee: 0,
      distanceKm: null,
      pickupLatLng: null,
      dropoffLatLng: null,
    }),
  });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.deliveryFee);
});

test("receipt is optional for cash and required for non-cash", async () => {
  const missingReceiptCash = await validateCheckout(basePayload({ paymentMethod: "cash", receiptImageUrl: "" }));
  assert.equal(missingReceiptCash.isValid, true);
  assert.equal(Boolean(missingReceiptCash.errors.receipt), false);

  const missingReceiptNonCash = await validateCheckout(basePayload({ paymentMethod: "gcash", receiptImageUrl: "" }));
  assert.equal(missingReceiptNonCash.isValid, false);
  assert.ok(missingReceiptNonCash.errors.receipt);

  const withReceiptCash = await validateCheckout(
    basePayload({ paymentMethod: "cash", receiptImageUrl: "data:image/png;base64,ZmFrZQ==" })
  );
  assert.equal(withReceiptCash.isValid, true);
  assert.equal(Boolean(withReceiptCash.errors.receipt), false);

  const withReceiptNonCash = await validateCheckout(
    basePayload({ paymentMethod: "gcash", receiptImageUrl: "data:image/png;base64,ZmFrZQ==" })
  );
  assert.equal(withReceiptNonCash.isValid, true);
  assert.equal(Boolean(withReceiptNonCash.errors.receipt), false);
});

test("phone must be PH +63 format", async () => {
  const invalidPhone = await validateCheckout(basePayload({ customer: { name: "A", phone: "09171234567", address: "Pasig City" } }));
  assert.equal(invalidPhone.isValid, false);
  assert.ok(invalidPhone.errors.phone);

  const validPhone = await validateCheckout(basePayload({ customer: { name: "A", phone: "+639171234567", address: "Pasig City" } }));
  assert.equal(validPhone.isValid, true);
  assert.equal(Boolean(validPhone.errors.phone), false);
});

test("valid payload passes", async () => {
  const result = await validateCheckout(basePayload());
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
});

test("valid delivery payload with delivery fee passes", async () => {
  const result = await validateCheckout(
    basePayload({
      orderType: "delivery",
      customer: { name: "A", phone: "+639171234567", address: "Lucena City" },
      deliveryMeta: baseDeliveryMeta(),
    })
  );
  assert.equal(result.isValid, true);
  assert.equal(Boolean(result.errors.deliveryFee), false);
});

test("non-cash still requires valid payment method", async () => {
  const invalidPayment = await validateCheckout(basePayload({ paymentMethod: "maya" }));
  assert.equal(invalidPayment.isValid, false);
  assert.ok(invalidPayment.errors.paymentMethod);

  const validPayment = await validateCheckout(basePayload({ paymentMethod: "gcash" }));
  assert.equal(validPayment.isValid, true);
  assert.equal(Boolean(validPayment.errors.paymentMethod), false);
});

test("missing menu item code fails validation", async () => {
  const result = await validateCheckout(
    basePayload({
      items: [{ id: "1", code: "", name: "Latte", qty: 1, price: 100 }],
    })
  );
  assert.equal(result.isValid, false);
  assert.ok(result.errors.items);
});

test("free latte rewards cannot be checked out on their own", async () => {
  const result = await validateCheckout(
    basePayload({
      items: [{ id: "reward-1", code: "LATTE-REWARD", name: "Free Latte", qty: 1, price: 0, isLoyaltyReward: true }],
    })
  );

  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.form,
    "Free latte rewards cannot be checked out on their own. Add at least one regular menu item."
  );
});

test("weekday orders close after 7:30 PM Manila time", async () => {
  const result = await validateCheckout(
    basePayload({
      currentDate: "2026-04-20T11:31:00.000Z",
    })
  );

  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.form,
    "Orders can only be placed from 8:00 AM - 7:30 PM on weekdays and 8:00 AM - 8:00 PM on weekends."
  );
});

test("weekend orders stay open until 8:00 PM Manila time", async () => {
  const openResult = await validateCheckout(
    basePayload({
      currentDate: "2026-04-25T11:59:00.000Z",
    })
  );
  assert.equal(openResult.isValid, true);

  const closedResult = await validateCheckout(
    basePayload({
      currentDate: "2026-04-25T12:01:00.000Z",
    })
  );
  assert.equal(closedResult.isValid, false);
  assert.equal(
    closedResult.errors.form,
    "Orders can only be placed from 8:00 AM - 7:30 PM on weekdays and 8:00 AM - 8:00 PM on weekends."
  );
});

test("custom owner cutoff schedule is enforced during checkout validation", async () => {
  const openResult = await validateCheckout(
    basePayload({
      currentDate: "2026-04-20T00:20:00.000Z",
      businessSettings: {
        kitchenCutoff: "Weekdays 08:00-17:00; Weekends 09:00-18:00",
      },
    })
  );
  assert.equal(openResult.isValid, true);

  const closedResult = await validateCheckout(
    basePayload({
      currentDate: "2026-04-20T09:31:00.000Z",
      businessSettings: {
        kitchenCutoff: "Weekdays 08:00-17:00; Weekends 09:00-18:00",
      },
    })
  );
  assert.equal(closedResult.isValid, false);
  assert.equal(
    closedResult.errors.form,
    "Orders can only be placed from 8:00 AM - 5:00 PM on weekdays and 9:00 AM - 6:00 PM on weekends."
  );
});
