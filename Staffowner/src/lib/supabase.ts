import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';

type ViteEnv = Record<string, string | undefined>;

const getViteEnv = (): ViteEnv => {
  return (import.meta.env as ViteEnv | undefined) ?? {};
};

export type SupabaseConfigStatus = {
  configured: boolean;
  url?: string;
  anonKey?: string;
  missing: string[];
};

export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  const env = getViteEnv();
  const url = env.VITE_SUPABASE_URL?.trim() || undefined;
  const anonKey =
    (env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? env.VITE_SUPABASE_KEY)?.trim() || undefined;

  const missing: string[] = [];
  if (!url) missing.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)');

  return { configured: missing.length === 0, url, anonKey, missing };
};

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export const getSupabaseClient = (): SupabaseClient | null => {
  const config = getSupabaseConfigStatus();
  if (!config.configured || !config.url || !config.anonKey) return null;

  const nextKey = `${config.url}::${config.anonKey}`;
  if (cachedClient && cachedKey === nextKey) return cachedClient;

  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedKey = nextKey;
  return cachedClient;
};

export const requireSupabaseClient = (): SupabaseClient => {
  const client = getSupabaseClient();
  if (client) return client;
  const config = getSupabaseConfigStatus();
  const missing = config.missing.length ? config.missing.join(', ') : 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY';
  throw new AppError({
    category: 'config',
    message: `Supabase is not configured. Missing env vars: ${missing}.`,
  });
};
