import test from "node:test";
import assert from "node:assert/strict";

import { validateCheckout } from "../src/services/checkoutValidation.js";

function basePayload(overrides = {}) {
  return {
    orderType: "takeout",
    paymentMethod: "cash",
    items: [{ id: "1", code: "ITEM-1", name: "Latte", qty: 1, price: 100 }],
    customer: { name: "Test User", phone: "+639171234567", address: "Pasig City" },
    receiptImageUrl: "data:image/png;base64,ZmFrZQ==",
    ...overrides,
  };
}

test("address is required for delivery", async () => {
  const payload = basePayload({ orderType: "delivery", customer: { name: "A", phone: "+639171234567", address: "" } });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.address);
});

test("address is required for pickup", async () => {
  const payload = basePayload({ orderType: "pickup", customer: { name: "A", phone: "+639171234567", address: "" } });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.address);
});

test("address is required for takeout", async () => {
  const payload = basePayload({ orderType: "takeout", customer: { name: "A", phone: "+639171234567", address: "" } });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.address);
});

test("address is required for dine-in", async () => {
  const payload = basePayload({ orderType: "dine_in", customer: { name: "A", phone: "+639171234567", address: "" } });
  const result = await validateCheckout(payload);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.address);
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
