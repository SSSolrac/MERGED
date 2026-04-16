import { createClient } from "@supabase/supabase-js";

function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getViteEnv() {
  return import.meta.env ?? {};
}

export function getSupabaseConfig(env = getViteEnv()) {
  const supabaseUrl = asNonEmptyText(env?.VITE_SUPABASE_URL);
  const supabaseAnonKey = asNonEmptyText(env?.VITE_SUPABASE_ANON_KEY);

  const missingEnvVars = [];
  if (!supabaseUrl) missingEnvVars.push("VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missingEnvVars.push("VITE_SUPABASE_ANON_KEY");

  return {
    supabaseUrl,
    supabaseAnonKey,
    missingEnvVars,
    isConfigured: missingEnvVars.length === 0,
  };
}

export function createSupabaseConfigError(config) {
  const missing = Array.isArray(config?.missingEnvVars) ? config.missingEnvVars : [];
  const suffix = missing.length ? ` Missing env vars: ${missing.join(", ")}.` : "";

  const err = new Error(
    `Supabase is not configured.${suffix} Set them in customer/frontend/.env (or your deployment environment) and reload.`
  );

  err.code = "SUPABASE_CONFIG_MISSING";
  err.missingEnvVars = missing;
  return err;
}

let cachedClient = null;
let cachedClientKey = "";

export function getSupabaseClient({ env } = {}) {
  const config = getSupabaseConfig(env);
  if (!config.isConfigured) {
    return {
      client: null,
      error: createSupabaseConfigError(config),
      config,
    };
  }

  const cacheKey = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    cachedClientKey = cacheKey;
  }

  return { client: cachedClient, error: null, config };
}

export function requireSupabaseClient(options) {
  const { client, error } = getSupabaseClient(options);
  if (error) throw error;
  return client;
}

export function isSupabaseConfigured({ env } = {}) {
  return getSupabaseConfig(env).isConfigured;
}
