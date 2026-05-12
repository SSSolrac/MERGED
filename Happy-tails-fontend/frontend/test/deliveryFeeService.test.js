import test from "node:test";
import assert from "node:assert/strict";

import {
  DELIVERY_PICKUP_POINT,
  calculateDeliveryFeeQuote,
} from "../src/services/deliveryFeeService.js";

test("delivery fee uses the base fare for nearby pins", () => {
  const quote = calculateDeliveryFeeQuote({
    dropoffLatLng: DELIVERY_PICKUP_POINT,
  });

  assert.equal(quote.deliveryFee, 49);
  assert.equal(quote.billedDistanceKm, 2);
  assert.equal(quote.distanceMethod, "haversine");
});

test("delivery fee rounds up started kilometers beyond the first 2 km", () => {
  const quote = calculateDeliveryFeeQuote({
    dropoffLatLng: {
      lat: DELIVERY_PICKUP_POINT.lat,
      lng: DELIVERY_PICKUP_POINT.lng,
    },
    roadDistanceKm: 3.2,
  });

  assert.equal(quote.distanceKm, 3.2);
  assert.equal(quote.billedDistanceKm, 4);
  assert.equal(quote.additionalKm, 2);
  assert.equal(quote.deliveryFee, 73);
  assert.equal(quote.distanceMethod, "road");
});

test("delivery fee calculator rejects invalid pins", () => {
  assert.throws(
    () => calculateDeliveryFeeQuote({ latitude: null, longitude: null }),
    /valid delivery pin/i
  );
});
