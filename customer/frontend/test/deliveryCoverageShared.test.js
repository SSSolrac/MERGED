import test from "node:test";
import assert from "node:assert/strict";

import {
  selectPreferredDeliveryArea,
  toCustomerDeliveryConfig,
} from "../src/staff/services/deliveryCoverageShared.js";

test("delivery coverage prefers the newest active area over a newer inactive row", () => {
  const preferred = selectPreferredDeliveryArea([
    {
      id: "area-inactive",
      name: "Draft Coverage",
      fixed_barangay_name: "Draft Barangay",
      city: "Lucena City",
      province: "Quezon",
      country: "Philippines",
      is_active: true,
      delivery_status: "inactive",
      updated_at: "2026-04-19T12:00:00Z",
    },
    {
      id: "area-live",
      name: "Live Coverage",
      fixed_barangay_name: "Ilayang Iyam",
      city: "Lucena City",
      province: "Quezon",
      country: "Philippines",
      is_active: true,
      delivery_status: "active",
      updated_at: "2026-04-18T12:00:00Z",
    },
  ]);

  assert.equal(preferred?.id, "area-live");
  assert.equal(preferred?.deliveryStatus, "active");
});

test("delivery coverage keeps the live customer polygon and purok payload as saved", () => {
  const config = toCustomerDeliveryConfig(
    {
      id: "area-1",
      name: "Live Coverage",
      fixed_barangay_name: "Ilayang Iyam",
      city: "Lucena City",
      province: "Quezon",
      country: "Philippines",
      is_active: true,
      delivery_status: "active",
    },
    [],
    []
  );

  assert.ok(config);
  assert.deepEqual(config.puroks, []);
  assert.deepEqual(config.polygon, []);
});
