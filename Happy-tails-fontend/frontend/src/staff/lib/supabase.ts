import {
  getSupabaseClient as getUnifiedSupabaseClient,
  getSupabaseConfig,
  requireSupabaseClient as requireUnifiedSupabaseClient,
} from '../../lib/supabase';

export type SupabaseConfigStatus = {
  configured: boolean;
  url?: string;
  anonKey?: string;
  missing: string[];
};

export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  const config = getSupabaseConfig();
  return {
    configured: config.isConfigured,
    url: config.supabaseUrl || undefined,
    anonKey: config.supabaseAnonKey || undefined,
    missing: config.missingEnvVars,
  };
};

export const getSupabaseClient = () => getUnifiedSupabaseClient().client;

export const requireSupabaseClient = () => requireUnifiedSupabaseClient();
