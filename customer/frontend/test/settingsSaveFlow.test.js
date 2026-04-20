import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readCustomerSource = (relativePath) =>
  readFile(path.join(__dirname, "..", relativePath), "utf8");

const readStaffownerSource = (relativePath) =>
  readFile(path.join(__dirname, "..", "..", "..", "Staffowner", relativePath), "utf8");

test("business settings save path avoids extra auth round-trips in both admin apps", async () => {
  const customerServiceSrc = await readCustomerSource("src/staff/services/businessSettingsService.ts");
  const staffownerServiceSrc = await readStaffownerSource("src/services/businessSettingsService.ts");

  assert.ok(
    !customerServiceSrc.includes("auth.getUser()"),
    "Unified staff business settings save should not block on auth.getUser()."
  );
  assert.ok(
    !staffownerServiceSrc.includes("auth.getUser()"),
    "Staffowner business settings save should not block on auth.getUser()."
  );
  assert.ok(
    customerServiceSrc.includes("updated_by: asText(settings.updatedByUserId) || null"),
    "Unified staff business settings save should use the caller-provided updatedByUserId."
  );
  assert.ok(
    staffownerServiceSrc.includes("updated_by: asText(settings.updatedByUserId) || null"),
    "Staffowner business settings save should use the caller-provided updatedByUserId."
  );
});

test("unified settings page hardens save handling and defers non-active tab loads", async () => {
  const pageSrc = await readCustomerSource("src/staff/pages/SettingsPage.tsx");

  assert.ok(pageSrc.includes("saveRequestLockRef"), "Unified settings page should guard duplicate save clicks.");
  assert.ok(pageSrc.includes("Save business details"), "Unified settings page should expose a dedicated business-details save action.");
  assert.ok(pageSrc.includes("Save checkout settings"), "Unified settings page should expose a dedicated checkout save action.");
  assert.ok(pageSrc.includes("type=\"submit\""), "Unified settings page should use form submission semantics for saves.");
  assert.ok(
    pageSrc.includes("activeTab !== 'announcements'"),
    "Unified settings page should lazy-load announcements only when the tab is opened."
  );
  assert.ok(
    pageSrc.includes("activeTab !== 'staff'"),
    "Unified settings page should lazy-load staff data only when the tab is opened."
  );
});

test("staffowner settings page hardens save handling around business details", async () => {
  const pageSrc = await readStaffownerSource("src/pages/SettingsPage.tsx");

  assert.ok(pageSrc.includes("saveRequestLockRef"), "Staffowner settings page should guard duplicate save clicks.");
  assert.ok(pageSrc.includes("Save business details"), "Staffowner settings page should expose a dedicated business-details save action.");
  assert.ok(pageSrc.includes("Save checkout settings"), "Staffowner settings page should expose a dedicated checkout save action.");
  assert.ok(pageSrc.includes("type=\"submit\""), "Staffowner settings page should use form submission semantics for saves.");
});
