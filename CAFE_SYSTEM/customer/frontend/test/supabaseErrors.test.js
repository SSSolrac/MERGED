import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSupabaseError } from "../src/lib/supabaseErrors.js";

test("error mapper classifies missing relation", () => {
  const err = {
    message: 'relation "public.profiles" does not exist',
    code: "42P01",
    status: 400,
  };

  const normalized = normalizeSupabaseError(err, { fallbackMessage: "Unable to load profile.", table: "profiles" });
  assert.equal(normalized.kind, "missing_relation");
  assert.ok(normalized.message.includes("Missing"));
});

test("error mapper classifies permission-denied", () => {
  const err = {
    message: "permission denied for relation orders",
    code: "42501",
    status: 403,
  };

  const normalized = normalizeSupabaseError(err, { fallbackMessage: "Unable to load orders.", table: "orders" });
  assert.equal(normalized.kind, "permission_denied");
  assert.ok(normalized.message.toLowerCase().includes("rls") || normalized.message.toLowerCase().includes("denied"));
});

