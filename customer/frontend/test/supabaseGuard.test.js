import test from "node:test";
import assert from "node:assert/strict";

test("missing config is detected without import-time throw", async () => {
  const supabaseModule = await import("../src/lib/supabase.js");

  assert.equal(typeof supabaseModule.getSupabaseConfig, "function");
  assert.equal(typeof supabaseModule.getSupabaseClient, "function");

  const config = supabaseModule.getSupabaseConfig({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" });
  assert.equal(config.isConfigured, false);
  assert.deepEqual(
    config.missingEnvVars.sort(),
    ["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_URL"].sort()
  );

  const { client, error } = supabaseModule.getSupabaseClient({ env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" } });
  assert.equal(client, null);
  assert.ok(error instanceof Error);
  assert.equal(error.code, "SUPABASE_CONFIG_MISSING");
});
