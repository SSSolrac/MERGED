import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPublicAppUrl, getPublicAppOrigin } from "../src/lib/appUrl.js";
import { buildAuthActionErrorMessage, readAuthRedirectState } from "../src/lib/authRedirects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFile(path.join(__dirname, "..", relativePath), "utf8");

test("app url helper prefers configured production origin and rejects localhost in production", () => {
  assert.equal(
    getPublicAppOrigin({
      env: {
        PROD: true,
        VITE_APP_URL: "https://happytailspetcafe.vercel.app",
      },
      location: { origin: "http://127.0.0.1:5173" },
    }),
    "https://happytailspetcafe.vercel.app"
  );

  assert.throws(
    () =>
      getPublicAppOrigin({
        env: {
          PROD: true,
          VITE_APP_URL: "http://127.0.0.1:5173",
        },
        location: { origin: "http://127.0.0.1:5173" },
      }),
    /localhost in production/i
  );

  assert.equal(
    buildPublicAppUrl("/auth/reset-password", {
      env: {
        PROD: false,
        VITE_APP_URL: "http://127.0.0.1:5173",
      },
      location: null,
    }),
    "http://127.0.0.1:5173/auth/reset-password"
  );
});

test("auth redirect parser reads action tokens from search and hash", () => {
  const state = readAuthRedirectState({
    href: "https://happytailspetcafe.vercel.app/auth/reset-password?type=recovery#access_token=abc&refresh_token=def",
    search: "?type=recovery",
    hash: "#access_token=abc&refresh_token=def",
  });

  assert.equal(state.type, "recovery");
  assert.equal(state.accessToken, "abc");
  assert.equal(state.refreshToken, "def");
  assert.equal(state.hasAuthParams, true);
});

test("auth redirect errors normalize expired link copy", () => {
  assert.equal(
    buildAuthActionErrorMessage(
      {
        errorCode: "otp_expired",
        errorDescription: "Email link is invalid or has expired",
      },
      "recovery"
    ),
    "This password reset link is invalid or has expired. Request a new link and use it right away."
  );
});

test("app uses dedicated auth action routes and lazy loading", async () => {
  const appSrc = await readSource("src/App.jsx");

  assert.ok(appSrc.includes('path="/auth/reset-password"'), "App should route password reset to a dedicated page.");
  assert.ok(appSrc.includes('path="/auth/email-change"'), "App should route email change confirmations to a dedicated page.");
  assert.ok(appSrc.includes('lazy(() => import("./pages/auth/ResetPasswordPage"))'), "Reset password page should be lazy-loaded.");
  assert.ok(appSrc.includes('lazy(() => import("./pages/auth/EmailChangePage"))'), "Email change page should be lazy-loaded.");
  assert.ok(!appSrc.includes("window.location.origin"), "App should not build auth redirects from window.location.origin directly.");
  assert.ok(!appSrc.includes("isRecoveryMode"), "App should no longer keep password recovery in modal-global state.");
});

test("customer profile no longer writes auth email directly into profiles", async () => {
  const profilePageSrc = await readSource("src/pages/Profile.jsx");
  const profileServiceSrc = await readSource("src/services/profileService.js");

  assert.ok(profilePageSrc.includes("profile-readonly-input"), "Customer profile should render account email as read-only.");
  assert.ok(profilePageSrc.includes("managed securely through account verification"), "Customer profile should explain why email is read-only.");
  assert.ok(!profileServiceSrc.includes("email: String(profile?.email"), "Customer profile saves should not overwrite profiles.email.");
});

test("schema syncs confirmed auth email changes into profiles", async () => {
  const schema = await readSource("supabase/unified_schema.sql");

  assert.ok(schema.includes("create or replace function public.sync_profile_email_from_auth_user"), "Schema should define the auth email sync trigger.");
  assert.ok(schema.includes("after update of email on auth.users"), "Schema should sync profiles after auth email updates.");
});

test("staff settings refresh source-of-truth data after add/revoke", async () => {
  const settingsSrc = await readSource("src/staff/pages/SettingsPage.tsx");

  assert.ok(settingsSrc.includes("const loadStaffMembers = useCallback"), "Staff settings should centralize staff reloads.");
  assert.ok(settingsSrc.includes("await loadStaffMembers().catch(() => null);"), "Staff settings should refresh staff data after mutations.");
  assert.ok(settingsSrc.includes("saved.assignmentStatus === 'already_staff'"), "Staff settings should surface already-staff outcomes explicitly.");
});
