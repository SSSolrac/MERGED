import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSupabaseError } from "../src/lib/supabaseErrors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.join(__dirname, "..", relativePath), "utf8");
const readSchema = () => readSource("supabase/unified_schema.sql");

test("profiles: frontend does not insert profiles rows (trigger-only)", async () => {
  const src = await readSource("src/services/profileService.js");
  assert.ok(!src.includes('.from("profiles").insert'), "profileService must not insert into profiles");
  assert.ok(src.includes("waitForProfileRow"), "profileService should use fetch-or-wait logic");
  assert.ok(src.includes("handle_new_user_profile"), "profileService should reference trigger-based creation in its error message");
});

test("orders: customer app uses transactional RPC and avoids DELETE", async () => {
  const src = await readSource("src/services/orderService.js");
  assert.ok(src.includes('create_customer_order'), "orderService should call transactional RPC for order creation");
  assert.ok(!src.includes('.from("orders").delete'), "orderService must not delete orders (RLS forbids customer DELETE)");
});

test("orders: tracking/history tolerates missing status history", async () => {
  const src = await readSource("src/services/orderService.js");
  assert.ok(src.includes("buildFallbackTimeline"), "orderService should include a fallback timeline builder");
  assert.ok(src.includes("history.length ? history.map"), "orderService should derive timeline from history when present");
  assert.ok(src.includes("buildFallbackTimeline(order)"), "orderService should fall back to a synthesized timeline when history is empty");
});

test("errors: missing RPC is classified and surfaced", async () => {
  const src = await readSource("src/lib/supabaseErrors.js");
  assert.ok(src.includes("missing_rpc"), "supabaseErrors should classify missing RPCs");

  const orderServiceSrc = await readSource("src/services/orderService.js");
  assert.ok(orderServiceSrc.includes("create_customer_order"), "orderService should target create_customer_order");
  assert.ok(orderServiceSrc.toLowerCase().includes("missing_rpc"), "orderService should detect missing_rpc and surface actionable message");
});

test("menu: categoryId is treated as UUID only (no legacy fallbacks)", async () => {
  const src = await readSource("src/services/menuService.js");
  assert.ok(src.includes("row.category_id"), "menuService must use menu_items.category_id");
  assert.ok(src.includes("isUuid"), "menuService should validate UUID category ids");
  assert.ok(!src.includes("category_name"), "menuService must not map categoryName -> categoryId");
  assert.ok(!src.includes("category_title"), "menuService must not map categoryTitle -> categoryId");
});

test("checkout: submit handler uses in-flight guard to avoid duplicate order submissions", async () => {
  const src = await readSource("src/pages/Checkout.jsx");
  assert.ok(src.includes("submitLockRef"), "Checkout should use an in-flight ref lock for submits.");
  assert.ok(src.includes("submitLockRef.current || isSubmitting"), "Checkout submit should short-circuit when a submit is already in progress.");
  assert.ok(src.includes("submitLockRef.current = false"), "Checkout submit lock should be released in finally.");
});

test("auth: getSession validates with getUser and clears invalid local auth", async () => {
  const src = await readSource("src/services/authService.js");
  assert.ok(src.includes(".auth.getUser"), "authService.getSession should validate sessions with supabase.auth.getUser()");
  assert.ok(src.includes('signOut({ scope: "local" })'), "authService should prefer local-only signOut to clear stale auth");
});

test("error mapper: classifies missing column", () => {
  const err = {
    message: 'column "total_amount" of relation "public.orders" does not exist',
    code: "42703",
    status: 400,
  };

  const normalized = normalizeSupabaseError(err, { fallbackMessage: "Unable to load orders.", table: "orders" });
  assert.equal(normalized.kind, "missing_column");
  assert.ok(normalized.message.toLowerCase().includes("missing"));
});

test("error mapper: classifies auth failures", () => {
  const err = {
    message: "Invalid JWT",
    status: 401,
  };

  const normalized = normalizeSupabaseError(err, { fallbackMessage: "Unable to restore session." });
  assert.equal(normalized.kind, "auth_failure");
  assert.ok(normalized.message.toLowerCase().includes("sign in"));
});

test("error mapper: classifies network failures", () => {
  const normalized = normalizeSupabaseError(new TypeError("Failed to fetch"), { fallbackMessage: "Unable to validate session." });
  assert.equal(normalized.kind, "network_failure");
  assert.ok(normalized.message.toLowerCase().includes("network"));
});

test("schema: order RPC enforces receipt + totals + item code integrity", async () => {
  const schema = await readSchema();
  assert.ok(schema.includes("create or replace function public.create_customer_order"), "Schema must define create_customer_order RPC.");
  assert.ok(schema.includes("v_receipt_required := p_payment_method <> 'cash';"), "Schema must enforce non-cash receipt requirement.");
  assert.ok(schema.includes("Receipt upload is required for non-cash payments."), "Schema should provide non-cash receipt error.");
  assert.ok(schema.includes("coalesce(trim(x.menu_item_code), '') = ''"), "Schema must require menu item codes for order line items.");
  assert.ok(schema.includes("Order totals do not match order items."), "Schema must reject mismatched order totals.");
  assert.ok(schema.includes("orders_receipt_required_for_non_cash"), "Schema should include table-level receipt constraint for non-cash orders.");
});

test("schema: dashboard top items are computed from completed/delivered orders", async () => {
  const schema = await readSchema();
  assert.ok(schema.includes("create or replace function public.dashboard_summary"), "Schema must define dashboard_summary RPC.");
  assert.ok(
    schema.includes("and o.status in ('completed', 'delivered')"),
    "Dashboard top items should only use completed/delivered orders."
  );
  assert.ok(
    schema.includes("when oi.line_total > 0 then oi.line_total"),
    "Dashboard top items should use fallback line total math when line_total is missing."
  );
  assert.ok(schema.includes("order by qty desc, revenue desc"), "Dashboard top items should be deterministically ranked.");
});
