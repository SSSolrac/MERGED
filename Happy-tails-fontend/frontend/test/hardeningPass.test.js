import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSupabaseError } from "../src/lib/supabaseErrors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.join(__dirname, "..", relativePath), "utf8");
const readSchema = () => readSource("supabase/unified_schema.sql");

async function listFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) return listFiles(entryPath);
      return [entryPath];
    })
  );
  return nested.flat();
}

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
  assert.ok(src.includes("const timeline = history.length"), "orderService should derive timeline from history when present");
  assert.ok(src.includes(": buildFallbackTimeline(order);"), "orderService should synthesize a timeline when history is empty");
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

test("checkout: customer app reads owner-managed availability settings", async () => {
  const src = await readSource("src/pages/Checkout.jsx");
  assert.ok(src.includes("getPublicBusinessSettings"), "Checkout should load public business settings.");
  assert.ok(src.includes("availableOrderTypeOptions"), "Checkout should derive order types from owner-managed settings.");
  assert.ok(src.includes("availablePaymentOptions"), "Checkout should derive payment methods from owner-managed settings.");
  assert.ok(src.includes("getOrderWindowStatus(currentTime, checkoutSettings)"), "Checkout should enforce the owner-managed cutoff schedule.");
});

test("checkout: delivery orders calculate and require a delivery fee quote", async () => {
  const checkoutSrc = await readSource("src/pages/Checkout.jsx");
  assert.ok(checkoutSrc.includes("calculateDeliveryFeeQuote"), "Checkout should calculate a delivery fee quote from the selected pin.");
  assert.ok(checkoutSrc.includes("const grandTotal = Math.max(cartSubtotal + summaryDeliveryFee, 0);"), "Checkout total should add the delivery fee.");
  assert.ok(checkoutSrc.includes("Delivery Fee"), "Checkout summary should show the delivery fee row.");

  const orderServiceSrc = await readSource("src/services/orderService.js");
  assert.ok(orderServiceSrc.includes("p_delivery_fee"), "Order service should send delivery fee to the order RPC.");
  assert.ok(orderServiceSrc.includes("...(rawDeliveryMeta || {})"), "Order service should preserve delivery fee metadata in the delivery payload.");
});

test("delivery coverage: checkout only renders the map from a ready live config", async () => {
  const src = await readSource("src/pages/Checkout.jsx");
  assert.ok(src.includes("isDeliveryConfigReady"), "Checkout should gate delivery map rendering on a ready live config.");
  assert.ok(
    src.includes("Delivery coverage is unavailable or incomplete right now."),
    "Checkout should show an explicit delivery coverage warning instead of a misleading fallback map."
  );
});

test("profile: customer address uses shared delivery-area config (no legacy lucena utility)", async () => {
  const src = await readSource("src/pages/Profile.jsx");
  assert.ok(src.includes("getActiveDeliveryConfig"), "Profile should load delivery coverage from the shared service.");
  assert.ok(src.includes("buildDeliveryAddress"), "Profile should build saved addresses with the shared delivery helper.");
  assert.ok(!src.includes("lucenaAddress"), "Profile should not depend on the removed lucenaAddress utility.");
});

test("delivery coverage: customer and staff services share the delivery area selector", async () => {
  const customerSrc = await readSource("src/services/deliveryAreaService.js");
  const staffSrc = await readSource("src/staff/services/deliveryCoverageService.ts");

  assert.ok(
    customerSrc.includes("selectPreferredDeliveryArea"),
    "Customer delivery config should use the shared preferred-area selector."
  );
  assert.ok(
    staffSrc.includes("selectPreferredDeliveryArea"),
    "Staff delivery coverage should use the shared preferred-area selector."
  );
  assert.ok(
    customerSrc.includes("toCustomerDeliveryConfig"),
    "Customer delivery config should be assembled from the shared delivery helper."
  );
  assert.ok(
    staffSrc.includes("toStaffDeliveryCoverage"),
    "Staff delivery coverage should be assembled from the shared delivery helper."
  );
});

test("codebase: no Google Maps runtime references remain in active source", async () => {
  const roots = [
    path.join(__dirname, "..", "src"),
    path.join(__dirname, "..", "supabase"),
    path.join(__dirname, "..", "..", "..", "Staffowner", "src"),
  ];

  const sourceFiles = (
    await Promise.all(roots.map((root) => listFiles(root)))
  )
    .flat()
    .filter((filePath) => /\.(js|jsx|ts|tsx|sql|md|css)$/i.test(filePath));

  const offenders = [];
  const forbiddenPattern = new RegExp(
    [
      ["google", "\\.", "maps"].join(""),
      ["maps", "\\.", "googleapis"].join(""),
      ["@react", "-", "google", "-", "maps"].join(""),
      ["google", "-", "map", "-", "react"].join(""),
    ].join("|"),
    "i"
  );

  for (const filePath of sourceFiles) {
    const contents = await readFile(filePath, "utf8");
    if (forbiddenPattern.test(contents)) {
      offenders.push(path.relative(path.join(__dirname, "..", "..", ".."), filePath));
    }
  }

  assert.deepEqual(offenders, [], "Active source should not contain Google Maps references.");
});

test("auth: getSession validates with getUser and clears invalid local auth", async () => {
  const src = await readSource("src/services/authService.js");
  assert.ok(src.includes(".auth.getUser"), "authService.getSession should validate sessions with supabase.auth.getUser()");
  assert.ok(src.includes('signOut({ scope: "local" })'), "authService should prefer local-only signOut to clear stale auth");
});

test("unified auth: staff/owner role profile is not overwritten by customer-only refresh", async () => {
  const src = await readSource("src/context/AuthContext.jsx");
  assert.ok(src.includes("getProfileForUser"), "AuthContext should use the canonical profile/role loader.");
  assert.ok(!src.includes("getCustomerProfile"), "AuthContext must not run a second customer-only profile refresh after staff/owner login.");

  const roleHelper = await readSource("src/services/auth/getCurrentUserRole.js");
  assert.ok(roleHelper.includes("normalizeAppRole(value, fallback"), "Role normalization should support null/unknown fallbacks.");
  assert.ok(roleHelper.includes("normalizeAppRole(row.role, null)"), "Canonical profile mapper should preserve unresolved roles as null.");
});

test("unified app: old Staffowner login/router boot files are not active", async () => {
  const activeSrcRoot = path.join(__dirname, "..", "src");
  const sourceFiles = (await listFiles(activeSrcRoot)).filter((filePath) => /\.(js|jsx|ts|tsx)$/i.test(filePath));

  const offenders = [];
  for (const filePath of sourceFiles) {
    const relative = path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/");
    const contents = await readFile(filePath, "utf8");
    if (
      /LoginPage|createBrowserRouter|RouterProvider|path:\s*['"]\/login['"]/.test(contents) &&
      !relative.includes("loginAuditService") &&
      !relative.includes("loginHistoryService") &&
      !relative.includes("useLoginHistory")
    ) {
      offenders.push(relative);
    }
  }

  assert.deepEqual(offenders, [], "Unified app must not keep the old Staffowner login/router in active source.");
});

test("auth modal: successful login redirect is parent-controlled", async () => {
  const modalSrc = await readSource("src/components/AuthModal.jsx");
  assert.ok(modalSrc.includes("await onLogin({ name, email, password, isSignup });"), "AuthModal should delegate credential handling to App.");
  assert.ok(
    !modalSrc.includes("await onLogin({ name, email, password, isSignup });\n      onClose();"),
    "AuthModal must not close itself after login because App owns the role redirect."
  );

  const appSrc = await readSource("src/App.jsx");
  assert.ok(appSrc.includes('setShowAuthModal(false);'), "App should close the auth modal after signup.");
  assert.ok(appSrc.includes('navigate("/", { replace: true });'), "App should clear route-auth state after signup.");
  assert.ok(
    appSrc.includes("navigate(getSafeRouteForRole(result?.role || role), { replace: true });"),
    "App should route staff/owner logins directly to their workspace."
  );
});

test("staff profile: only owners can manage staff-side credentials", async () => {
  const profilePageSrc = await readSource("src/staff/pages/ProfilePage.tsx");
  assert.ok(profilePageSrc.includes("const canManageCredentials = user?.role === 'owner';"), "Staff profile page should gate credential controls by owner role.");
  assert.ok(profilePageSrc.includes("Only owners can change staff-side passwords."), "Staff profile page should block non-owner password submissions.");
  assert.ok(profilePageSrc.includes("No email assigned"), "Staff profile page should render email as plain text for staff accounts.");
  assert.ok(profilePageSrc.includes("{canManageCredentials ? ("), "Staff profile page should only render password controls for owners.");

  const staffAuthSrc = await readSource("src/staff/services/authService.ts");
  assert.ok(staffAuthSrc.includes(".from('profiles')"), "Staff auth service should verify the signed-in profile before changing a password.");
  assert.ok(staffAuthSrc.includes("select('role')"), "Staff auth service should check the current profile role before changing a password.");
  assert.ok(staffAuthSrc.includes("Only owners can change staff-side passwords."), "Staff auth service should reject password changes from non-owner accounts.");
});

test("staff workspace: dashboard keeps operations visible and financial data owner-only", async () => {
  const appSrc = await readSource("src/App.jsx");
  const roleRoutesSrc = await readSource("src/auth/roleRoutes.js");
  const dashboardSrc = await readSource("src/staff/pages/DashboardPage.tsx");
  const dashboardHookSrc = await readSource("src/staff/hooks/useDashboardData.ts");
  const dashboardServiceSrc = await readSource("src/staff/services/dashboardService.ts");
  const layoutSrc = await readSource("src/staff/components/dashboard/DashboardLayout.tsx");
  const commandBarSrc = await readSource("src/staff/components/navigation/CommandBar.tsx");
  const mobileNavSrc = await readSource("src/staff/components/navigation/MobileNav.tsx");
  const schema = await readSchema();

  assert.ok(roleRoutesSrc.includes('if (normalized === "staff") return "/staff/dashboard";'), "Staff logins should keep the operational dashboard.");
  assert.ok(appSrc.includes('<Route path="dashboard" element={<DashboardPage />} />'), "Dashboard route should be available to staff and owner workspaces.");
  assert.ok(layoutSrc.includes("Dashboard Overview") && !layoutSrc.includes("Dashboard Overview', path: `${workspaceBasePath}/dashboard`, icon: LayoutDashboard, ownerOnly: true"), "Dashboard nav item should remain visible to staff.");
  assert.ok(commandBarSrc.includes("{ label: 'Dashboard Overview', path: `${workspaceBasePath}/dashboard` }"), "Quick search should keep dashboard available to staff.");
  assert.ok(mobileNavSrc.includes(">Overview</NavLink>") && !mobileNavSrc.includes("isOwner ? ("), "Mobile nav should keep overview available to staff.");
  assert.ok(dashboardSrc.includes("const isOwner = user?.role === 'owner';"), "Dashboard should know whether the viewer is an owner.");
  assert.ok(dashboardSrc.includes("{isOwner ? (") && dashboardSrc.includes("Gross sales"), "Financial dashboard cards and charts should render only for owners.");
  assert.ok(dashboardHookSrc.includes("includeFinancialSummary: isOwner"), "Staff dashboard data loading should skip financial summary requests.");
  assert.ok(dashboardServiceSrc.includes("includeFinancialSummary ? supabase.rpc('dashboard_summary'") && dashboardServiceSrc.includes("emptyDashboardData"), "Dashboard service should avoid owner-only summary RPCs for staff.");
  assert.ok(schema.includes("not public.is_owner()"), "Dashboard summary RPC should reject non-owner callers.");
});

test("staff settings and menu management use image uploads instead of raw URL fields", async () => {
  const settingsSrc = await readSource("src/staff/pages/SettingsPage.tsx");
  assert.ok(settingsSrc.includes("uploadBrandingAsset"), "Business settings should upload branding images.");
  assert.ok(settingsSrc.includes("Logo / Branding picture"), "Business settings should expose picture upload copy.");
  assert.ok(settingsSrc.includes("Checkout cut-off hours"), "Checkout settings should show the fixed weekday/weekend cutoff schedule.");
  assert.ok(settingsSrc.includes("Weekday opening time"), "Checkout settings should let owners edit weekday opening time.");
  assert.ok(settingsSrc.includes("Weekday closing time"), "Checkout settings should let owners edit weekday closing time.");
  assert.ok(settingsSrc.includes("Weekend opening time"), "Checkout settings should let owners edit weekend opening time.");
  assert.ok(settingsSrc.includes("Weekend closing time"), "Checkout settings should let owners edit weekend closing time.");
  assert.ok(settingsSrc.includes("serializeOrderWindowConfig"), "Checkout settings should save the edited cutoff schedule.");
  assert.ok(!settingsSrc.includes("Logo URL / Branding asset"), "Business settings should not expose the old raw logo URL field.");
  assert.ok(!settingsSrc.includes("Owner Account"), "Settings should not duplicate owner password controls.");
  assert.ok(!settingsSrc.includes("Service Fee (%)"), "Settings should not expose the service fee field.");
  assert.ok(!settingsSrc.includes("'account'"), "Settings should not keep the old account tab.");
  assert.ok(!settingsSrc.includes("Kitchen cut-off time"), "Checkout settings should not show the stale single cutoff input.");

  const menuManagementSrc = await readSource("src/staff/pages/menu/MenuManagementPage.tsx");
  assert.ok(menuManagementSrc.includes("Upload category picture"), "Category editor should upload category pictures.");
  assert.ok(menuManagementSrc.includes("groupedMenuItems"), "Menu items should be grouped by category.");
  assert.ok(menuManagementSrc.includes("Menu Categories"), "Menu management should expose category tabs.");
  assert.ok(menuManagementSrc.includes("Discount Tools"), "Menu management should collapse discount controls behind tabs.");
  assert.ok(menuManagementSrc.includes("Mark as limited item"), "Menu item editor should expose a simple limited item toggle.");
  assert.ok(!menuManagementSrc.includes("Image URL (optional)"), "Menu item editor should not expose raw image URL input.");
  assert.ok(!menuManagementSrc.includes("Discount amount"), "Menu item editor should not expose the old raw discount amount field.");
  assert.ok(!menuManagementSrc.includes("Discount starts at"), "Menu item editor should not expose discount schedule fields.");
  assert.ok(!menuManagementSrc.includes("Discount ends at"), "Menu item editor should not expose discount schedule fields.");
  assert.ok(!menuManagementSrc.includes("Limited time ends at"), "Menu item editor should not expose raw limited-end datetime field.");

  const inventorySrc = await readSource("src/staff/pages/menu/InventoryTrackerSection.tsx");
  assert.ok(inventorySrc.includes("inventoryTabs"), "Inventory page should build tab-style category filters.");
  assert.ok(inventorySrc.includes("Inventory Categories"), "Inventory page should expose category tabs.");
});

test("menu: schema and customer cards preserve discount mode and category images", async () => {
  const schema = await readSchema();
  assert.ok(schema.includes("alter table public.menu_categories add column if not exists image_url text"), "Schema should add category image URLs.");
  assert.ok(schema.includes("discount_type text not null default 'amount'"), "Schema should store discount type.");
  assert.ok(schema.includes("discount_value numeric(10,2) not null default 0"), "Schema should store the entered discount value.");
  assert.ok(schema.includes("mi.discount_type"), "Availability view should expose discount type.");
  assert.ok(schema.includes("mi.discount_value"), "Availability view should expose discount value.");

  const menuServiceSrc = await readSource("src/services/menuService.js");
  assert.ok(menuServiceSrc.includes("discount_type"), "Customer menu service should read discount type.");
  assert.ok(menuServiceSrc.includes("discount_value"), "Customer menu service should read discount value.");
  assert.ok(menuServiceSrc.includes("image_url ?? row.imageUrl"), "Customer menu service should map category image URLs.");

  const orderSrc = await readSource("src/pages/Order.jsx");
  assert.ok(orderSrc.includes("category.imageUrl || getCategoryImage"), "Category cards should prefer uploaded category images.");

  const orderCategorySrc = await readSource("src/pages/OrderCategory.jsx");
  assert.ok(orderCategorySrc.includes("buildDiscountLabel"), "Customer item cards should format discount labels from saved mode.");
  assert.ok(orderCategorySrc.includes("DISCOUNTED"), "Customer item cards should show a discounted overlay tag.");
});

test("storage: customers can upload profile photos to their own folder", async () => {
  const schema = await readSchema();
  assert.ok(schema.includes('menu_images_profile_insert_self'), "Schema should allow self-service profile image uploads.");
  assert.ok(schema.includes('menu_images_profile_update_self'), "Schema should allow self-service profile image updates.");
  assert.ok(schema.includes('menu_images_profile_delete_self'), "Schema should allow self-service profile image deletes.");
  assert.ok(schema.includes("(storage.foldername(name))[1] = ''profiles''"), "Profile image policies should target the profiles folder.");
  assert.ok(schema.includes("(storage.foldername(name))[2] = auth.uid()::text"), "Profile image policies should scope uploads to the signed-in user.");

  const profileSrc = await readSource("src/pages/Profile.jsx");
  assert.ok(!profileSrc.includes("uploadCustomerProfileImage"), "Customer profile should not wire the profile image upload helper.");
  assert.ok(!profileSrc.includes("Upload photo"), "Customer profile should not expose an upload-photo action.");
  assert.ok(!profileSrc.includes("Remove photo"), "Customer profile should not expose a remove-photo action.");
});

test("loyalty: free groom is saved as an in-store profile reward", async () => {
  const loyaltyServiceSrc = await readSource("src/services/loyaltyService.js");
  assert.ok(loyaltyServiceSrc.includes("buildInStoreRewardBalances"), "Customer loyalty data should derive saved in-store rewards.");
  assert.ok(loyaltyServiceSrc.includes("inStoreRewardBalances"), "Customer loyalty payload should include in-store reward balances.");

  const profileSrc = await readSource("src/pages/Profile.jsx");
  assert.ok(profileSrc.includes("Saved In-Store Rewards"), "Profile should show saved in-store rewards.");
  assert.ok(
    profileSrc.includes("can only be redeemed in store"),
    "Free Groom redemption should tell customers it is redeemed in store."
  );

  const cardSrc = await readSource("src/components/loyalty/LoyaltyCard.jsx");
  assert.ok(cardSrc.includes("Save in-store reward"), "Free Groom action should clearly save an in-store reward.");
});

test("loyalty: staff can reset customer loyalty cards through audited RPC", async () => {
  const schema = await readSchema();
  assert.ok(schema.includes("create or replace function public.reset_customer_loyalty_card"), "Schema should define reset_customer_loyalty_card RPC.");
  assert.ok(schema.includes("Only owner or staff can reset loyalty cards."), "Reset RPC should enforce staff/owner access.");
  assert.ok(schema.includes("'Reset loyalty card'"), "Reset RPC should record an activity log entry.");

  const serviceSrc = await readSource("src/staff/services/loyaltyService.ts");
  assert.ok(serviceSrc.includes("reset_customer_loyalty_card"), "Staff loyalty service should call the reset RPC.");

  const pageSrc = await readSource("src/staff/pages/customers/CustomersLoyaltyPage.tsx");
  assert.ok(pageSrc.includes("Reset Loyalty Card"), "Staff customer loyalty page should expose a reset-card action.");
});

test("loyalty: activity events render only through notifications", async () => {
  const cardSrc = await readSource("src/components/loyalty/LoyaltyCard.jsx");
  assert.ok(!cardSrc.includes("recentActivity"), "Loyalty card should not render the loyalty activity feed.");
  assert.ok(!cardSrc.includes("loyalty-card__meta"), "Loyalty card should not keep the old activity-feed container.");

  const notificationSrc = await readSource("src/services/notificationService.js");
  assert.ok(notificationSrc.includes("buildLoyaltyStampNotifications"), "Loyalty stamp events should still surface as notifications.");
});

test("notifications: read state hides customer items and preserves staff history", async () => {
  const customerNotificationSrc = await readSource("src/services/notificationService.js");
  assert.ok(
    customerNotificationSrc.includes("readStore().filter((item) => !item.isRead)"),
    "Customer notification lists should hide read notifications."
  );
  assert.ok(
    customerNotificationSrc.includes("return getCustomerNotifications();"),
    "Customer notification sync should return the visible unread list."
  );

  const staffHookSrc = await readSource("src/staff/hooks/useNotifications.ts");
  assert.ok(staffHookSrc.includes("unreadNotifications"), "Staff hook should expose unread notifications for the popup queue.");
  assert.ok(staffHookSrc.includes("readNotifications"), "Staff hook should expose read notifications for history.");

  const staffLayoutSrc = await readSource("src/staff/components/dashboard/DashboardLayout.tsx");
  assert.ok(staffLayoutSrc.includes("unreadNotifications.slice"), "Staff popup should render unread notifications first.");
  assert.ok(staffLayoutSrc.includes("View read notifications"), "Staff popup should retain a read-notification history section.");
});

test("checkout: zero-total orders use a receipt-free payment path", async () => {
  const checkoutSrc = await readSource("src/pages/Checkout.jsx");
  assert.ok(checkoutSrc.includes("const isFreeOrder = (!requiresDeliveryAddress || deliveryFeeQuote.isReady) && grandTotal <= 0;"), "Checkout should detect free orders after delivery fees are applied.");
  assert.ok(
    checkoutSrc.includes('const effectivePaymentMethod = isFreeOrder ? "cash" : form.paymentMethod;'),
    "Free orders should use a receipt-free payment path."
  );
  assert.ok(
    checkoutSrc.includes("No payment needed for this free reward checkout."),
    "Checkout should explain why free reward orders skip payment proof."
  );
});

test("menu belt: carousel cards show discount treatment like menu item cards", async () => {
  const beltSrc = await readSource("src/components/MenuBelt.jsx");
  assert.ok(beltSrc.includes("buildDiscountLabel"), "Menu carousel should format discount labels.");
  assert.ok(beltSrc.includes("DISCOUNTED"), "Menu carousel should show discounted tags.");
  assert.ok(beltSrc.includes("entryName.includes(key)"), "Menu carousel should resolve featured items with partial menu-name matches.");

  const beltCss = await readSource("src/components/MenuBelt.css");
  assert.ok(beltCss.includes(".belt-card-tag--discounted"), "Menu carousel should style discounted tags.");
  assert.ok(beltCss.includes(".belt-promo-pill"), "Menu carousel should style discount amount pills.");
});

test("order history: customer history is paginated to five orders per page", async () => {
  const historySrc = await readSource("src/pages/OrderHistory.jsx");
  assert.ok(historySrc.includes("const ORDERS_PER_PAGE = 5;"), "Order history should limit each page to five orders.");
  assert.ok(historySrc.includes("visibleOrders"), "Order history should render only the current page slice.");
  assert.ok(historySrc.includes("Page {safePageIndex + 1} of {totalPages}"), "Order history should expose next-page navigation.");

  const historyCss = await readSource("src/pages/OrderHistory.css");
  assert.ok(historyCss.includes(".history-pagination"), "Order history should style pagination controls.");
});

test("loyalty: free latte claims require a regular menu order", async () => {
  const profileSrc = await readSource("src/pages/Profile.jsx");
  assert.ok(profileSrc.includes("hasClaimableOrderCart"), "Profile should require an order cart before adding a free latte reward.");
  assert.ok(
    profileSrc.includes("regular menu item before claiming this free latte"),
    "Profile should explain that a free latte cannot be claimed by itself."
  );

  const checkoutSrc = await readSource("src/pages/Checkout.jsx");
  assert.ok(checkoutSrc.includes("hasOrderForLoyaltyReward"), "Checkout should block reward-only carts.");
  assert.ok(
    checkoutSrc.includes("canCheckoutWithLoyaltyRewards"),
    "Checkout should still require an authenticated account for loyalty rewards."
  );
  assert.ok(
    checkoutSrc.includes("cannot be checked out on their own"),
    "Checkout should explain that free latte rewards need another menu item in the cart."
  );
  assert.ok(
    checkoutSrc.includes("can be included with delivery, pickup, dine-in, or takeout orders"),
    "Checkout should allow free latte rewards for delivery as long as the cart includes other items."
  );

  const schema = await readSchema();
  assert.ok(
    schema.includes("Free latte rewards must be claimed with a regular menu order."),
    "Order RPC should reject reward-only orders."
  );
  assert.ok(
    !schema.includes("Free latte rewards can only be claimed with pickup, dine-in, or takeout orders."),
    "Order RPC should no longer block delivery orders that include a regular menu item."
  );
});

test("cart: reward item images fall back instead of rendering broken pictures", async () => {
  const menuImagesSrc = await readSource("src/utils/menuImages.js");
  assert.ok(menuImagesSrc.includes('["Cafe Latte", coffeeIcon]'), "Cafe Latte reward items should resolve to a local image.");

  const miniCartSrc = await readSource("src/components/MiniCartPanel.jsx");
  assert.ok(miniCartSrc.includes("coffeeFallback"), "Mini cart should use a fallback image for missing cart item images.");
  assert.ok(miniCartSrc.includes("onError={handleFallbackImage}"), "Mini cart should recover from broken image URLs.");
  assert.ok(miniCartSrc.includes('navigate("/checkout");'), "Mini cart should always send guests straight to checkout.");
  assert.ok(!miniCartSrc.includes("Sign In to Checkout"), "Mini cart should not pretend sign-in is required for guest checkout.");

  const cartSrc = await readSource("src/pages/Cart.jsx");
  assert.ok(cartSrc.includes("coffeeFallback"), "Full cart should use a fallback image for missing cart item images.");
  assert.ok(cartSrc.includes("onError={handleFallbackImage}"), "Full cart should recover from broken image URLs.");
});

test("profile: profile info form is shown inside a card shell", async () => {
  const profileCss = await readSource("src/pages/Profile.css");
  assert.ok(profileCss.includes(".profile-form"), "Profile CSS should style the profile form.");
  assert.ok(profileCss.includes("background: rgba(255, 255, 255, 0.92);"), "Profile form should have a white card background.");
  assert.ok(profileCss.includes("box-shadow: 0 16px 38px"), "Profile form should have card depth like the loyalty card.");
});

test("staffowner merge: original staff persistence services are preserved", async () => {
  const originalRoot = path.join(__dirname, "..", "..", "..", "Staffowner", "src", "services");
  const migratedRoot = path.join(__dirname, "..", "src", "staff", "services");
  const originalFiles = (await readdir(originalRoot)).filter((name) => name.endsWith(".ts") && name !== "authService.ts").sort();
  const migratedFiles = (await readdir(migratedRoot)).filter((name) => name.endsWith(".ts") && name !== "authService.ts").sort();

  assert.deepEqual(migratedFiles, originalFiles, "Migrated staff services should include the same service files as Staffowner.");

  const changed = [];
  for (const fileName of originalFiles) {
    const original = (await readFile(path.join(originalRoot, fileName), "utf8")).replace(/\r\n/g, "\n");
    const migrated = (await readFile(path.join(migratedRoot, fileName), "utf8")).replace(/\r\n/g, "\n");
    if (original !== migrated) changed.push(fileName);
  }

  assert.deepEqual(changed, [], "Staff persistence service implementations should match the original Staffowner app.");
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
  assert.ok(schema.includes("p_delivery_fee numeric default 0"), "Schema order RPC should accept delivery fee input.");
  assert.ok(schema.includes("Delivery fee is required for delivery orders."), "Schema should require a delivery fee for delivery orders.");
  assert.ok(schema.includes("Delivery fee can only be applied to delivery orders."), "Schema should reject delivery fees on non-delivery orders.");
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
