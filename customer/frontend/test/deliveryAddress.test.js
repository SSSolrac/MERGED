import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeliveryAddress,
  parseDeliveryAddress,
  validateDeliveryAddress,
} from "../src/utils/deliveryAddress.js";

const deliveryConfig = {
  id: "area-1",
  fixedBarangayName: "Ilayang Iyam",
  city: "Lucena City",
  province: "Quezon",
  country: "Philippines",
  isActive: true,
  deliveryStatus: "active",
  puroks: [
    { id: "purok-1", purokName: "Purok Sampaguita", isActive: true, deliveryStatus: "active" },
    { id: "purok-2", purokName: "Purok Carmelita", isActive: true, deliveryStatus: "active" },
  ],
  polygon: [
    { lat: 13.9405, lng: 121.6215, pointOrder: 0 },
    { lat: 13.9405, lng: 121.6245, pointOrder: 1 },
    { lat: 13.9435, lng: 121.6245, pointOrder: 2 },
    { lat: 13.9435, lng: 121.6215, pointOrder: 3 },
  ],
};

test("buildDeliveryAddress normalizes configured delivery labels", () => {
  const address = buildDeliveryAddress({
    houseDetails: "Blk 9 Lot 4",
    purokName: "Purok Sampaguita",
    fixedBarangayName: deliveryConfig.fixedBarangayName,
    city: deliveryConfig.city,
    province: deliveryConfig.province,
    country: deliveryConfig.country,
  });

  assert.equal(address, "Blk 9 Lot 4, Purok Sampaguita, Ilayang Iyam, Lucena City, Quezon, Philippines");
});

test("parseDeliveryAddress resolves the saved purok from shared delivery config", () => {
  const parsed = parseDeliveryAddress(
    "Unit 5, Purok Carmelita, Ilayang Iyam, Lucena City, Quezon, Philippines",
    deliveryConfig
  );

  assert.equal(parsed.houseDetails, "Unit 5");
  assert.equal(parsed.selectedPurokId, "purok-2");
});

test("validateDeliveryAddress accepts an active purok with a pin inside the polygon", () => {
  const result = validateDeliveryAddress({
    houseDetails: "Blk 4 Lot 8",
    selectedPurokId: "purok-1",
    latitude: 13.942,
    longitude: 121.623,
    config: deliveryConfig,
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(
    result.normalizedAddress,
    "Blk 4 Lot 8, Purok Sampaguita, Ilayang Iyam, Lucena City, Quezon, Philippines"
  );
});

test("validateDeliveryAddress rejects pins outside the configured polygon", () => {
  const result = validateDeliveryAddress({
    houseDetails: "Blk 4 Lot 8",
    selectedPurokId: "purok-1",
    latitude: 13.95,
    longitude: 121.63,
    config: deliveryConfig,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.mapPin, "Selected pin is outside the delivery area.");
});
