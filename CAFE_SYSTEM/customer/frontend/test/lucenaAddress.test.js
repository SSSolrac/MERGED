import test from "node:test";
import assert from "node:assert/strict";

import {
  composeLucenaAddress,
  findLucenaBarangay,
  findLucenaPurok,
  getPuroksForBarangay,
  parseLucenaAddress,
} from "../src/utils/lucenaAddress.js";

test("findLucenaBarangay only accepts Ilayang Iyam", () => {
  assert.equal(findLucenaBarangay("  ilayang iyam  "), "Ilayang Iyam");
  assert.equal(findLucenaBarangay("Pasig"), "");
});

test("getPuroksForBarangay returns verified Ilayang Iyam puroks", () => {
  assert.deepEqual(getPuroksForBarangay("Ilayang Iyam"), [
    "Purok Pinagbuklod",
    "Purok Carmelita",
    "Purok Sampaguita",
  ]);
});

test("findLucenaPurok resolves known aliases", () => {
  assert.equal(findLucenaPurok("Ilayang Iyam", "carmelitas"), "Purok Carmelita");
});

test("composeLucenaAddress builds fixed Ilayang Iyam addresses", () => {
  const composed = composeLucenaAddress({
    houseDetails: "Blk 1 Lot 2, Sunrise Homes",
    purok: "Purok Pinagbuklod",
    barangay: "Ilayang Iyam",
  });
  assert.equal(composed, "Blk 1 Lot 2, Sunrise Homes, Purok Pinagbuklod, Ilayang Iyam, Lucena City, Quezon, Philippines");
});

test("parseLucenaAddress resolves Ilayang Iyam purok and house details", () => {
  const parsed = parseLucenaAddress("Blk 9 Lot 4, Purok Sampaguita, Ilayang Iyam, Lucena City, Quezon, Philippines");
  assert.equal(parsed.barangay, "Ilayang Iyam");
  assert.equal(parsed.purok, "Purok Sampaguita");
  assert.equal(parsed.houseDetails, "Blk 9 Lot 4");
});

test("parseLucenaAddress normalizes Carmelitas alias to canonical purok", () => {
  const parsed = parseLucenaAddress("Unit 5, Purok Carmelitas, Ilayang Iyam, Lucena City, Quezon, Philippines");
  assert.equal(parsed.barangay, "Ilayang Iyam");
  assert.equal(parsed.purok, "Purok Carmelita");
  assert.equal(parsed.houseDetails, "Unit 5");
});
