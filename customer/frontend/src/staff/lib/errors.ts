import { asRecord } from '@/lib/mappers';

export type AppErrorCategory = 'config' | 'auth' | 'permission' | 'schema' | 'network' | 'backend' | 'unknown';

type AppErrorParams = {
  category: AppErrorCategory;
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  cause?: unknown;
};

export class AppError extends Error {
  readonly category: AppErrorCategory;
  readonly code?: string;
  readonly status?: number;
  readonly details?: string;
  readonly hint?: string;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.name = 'AppError';
    this.category = params.category;
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.hint = params.hint;
    // TS doesn't always type Error.cause depending on lib target.
    // @ts-expect-error - Error.cause typing depends on TS/lib version.
    this.cause = params.cause;
  }
}

type ErrorContext = {
  fallbackMessage?: string;
  action?: string;
};

const asNonEmptyString = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

const getStringFromErrorLike = (error: unknown, key: string): string | null => {
  const record = asRecord(error);
  if (!record) return null;
  return asNonEmptyString(record[key]);
};

const getNumberFromErrorLike = (error: unknown, key: string): number | null => {
  const record = asRecord(error);
  if (!record) return null;
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const asNumber = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(asNumber) ? asNumber : null;
};

const getBaseMessage = (error: unknown): string => {
  const message = getStringFromErrorLike(error, 'message') ?? (error instanceof Error ? error.message : null);
  return message?.trim() ?? '';
};

const getCode = (error: unknown): string | undefined => {
  const code = getStringFromErrorLike(error, 'code');
  return code?.trim() || undefined;
};

const getStatus = (error: unknown): number | undefined => {
  const status = getNumberFromErrorLike(error, 'status') ?? getNumberFromErrorLike(error, 'statusCode');
  return status ?? undefined;
};

const getDetails = (error: unknown): string | undefined => {
  const details = getStringFromErrorLike(error, 'details');
  return details?.trim() || undefined;
};

const getHint = (error: unknown): string | undefined => {
  const hint = getStringFromErrorLike(error, 'hint');
  return hint?.trim() || undefined;
};

const matchRelationMissing = (message: string): string | null => {
  const match = message.match(/relation "(?<relation>[^"]+)" does not exist/i);
  return match?.groups?.relation ?? null;
};

const matchColumnMissing = (message: string): { relation: string | null; column: string | null } => {
  const match = message.match(/column "(?<column>[^"]+)"(?: of relation "(?<relation>[^"]+)")? does not exist/i);
  return { relation: match?.groups?.relation ?? null, column: match?.groups?.column ?? null };
};

const matchRpcMissing = (message: string): string | null => {
  // Example: "Could not find the function public.dashboard_summary(range_key) in the schema cache"
  const match = message.match(/function (?<fn>[a-zA-Z0-9_.]+)\(/i);
  if (match?.groups?.fn) return match.groups.fn;
  return null;
};

const isNetworkMessage = (message: string) =>
  /failed to fetch|networkerror|load failed|fetch failed|econnreset|enotfound|eai_again/i.test(message);

const isAuthMessage = (message: string) =>
  /jwt|not authenticated|invalid login|invalid refresh token|session.*expired|auth session missing|user.*does not exist|user not found/i.test(message);

const isPermissionMessage = (message: string) =>
  /row-level security|rls|permission denied|insufficient privilege|not allowed/i.test(message);

const isSchemaMessage = (message: string) =>
  /schema cache|could not find the function|unknown column|unknown rpc/i.test(message)
  || /relation "[^"]+" does not exist/i.test(message)
  || /column "[^"]+"(?: of relation "[^"]+")? does not exist/i.test(message);

const classifyError = (params: { message: string; code?: string; status?: number }): AppErrorCategory => {
  const message = params.message.toLowerCase();

  if (/supabase env vars|supabase is not configured|missing supabase/i.test(message)) return 'config';
  if (params.status === 401) return 'auth';
  if (params.status === 403) return 'permission';
  if (params.code === '42501') return 'permission';
  if (params.code === '42P01' || params.code === '42703') return 'schema';
  if (params.code === '54001' || /stack depth limit exceeded/i.test(message)) return 'backend';
  if (isNetworkMessage(message)) return 'network';
  if (isAuthMessage(message)) return 'auth';
  if (isPermissionMessage(message)) return 'permission';
  if (isSchemaMessage(message)) return 'schema';
  return 'unknown';
};

const withActionPrefix = (message: string, context?: ErrorContext): string => {
  const action = context?.action?.trim();
  if (!action) return message;
  if (!message.trim()) return action;
  return `${action}: ${message}`;
};

const buildActionableMessage = (params: {
  category: AppErrorCategory;
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  context?: ErrorContext;
}): string => {
  const rawMessage = params.message.trim();

  if (params.category === 'backend') {
    const isStackDepth = params.code === '54001' || /stack depth limit exceeded/i.test(rawMessage);
    if (isStackDepth) {
      return withActionPrefix(
        "Supabase failed to load data (Postgres error 54001: stack depth limit exceeded). This is usually caused by a recursive Row Level Security (RLS) policy. Fix the RLS policies in Supabase.",
        params.context,
      );
    }
  }

  if (params.category === 'schema') {
    const relation = matchRelationMissing(rawMessage);
    if (relation) {
      return withActionPrefix(
        `Backend schema is missing relation "${relation}". Apply the latest schema/migrations (and refresh PostgREST schema cache if needed).`,
        params.context,
      );
    }

    const { relation: rel2, column } = matchColumnMissing(rawMessage);
    if (column) {
      return withActionPrefix(
        rel2
          ? `Backend schema is missing column "${column}" on "${rel2}". Apply the latest schema/migrations.`
          : `Backend schema is missing column "${column}". Apply the latest schema/migrations.`,
        params.context,
      );
    }

    const fn = matchRpcMissing(rawMessage);
    if (fn || /schema cache/i.test(rawMessage)) {
      return withActionPrefix(
        fn
          ? `Backend is missing RPC function "${fn}". Deploy the function and refresh PostgREST schema cache.`
          : 'Backend schema cache is out of date or missing functions/tables. Refresh PostgREST schema cache and apply the latest schema.',
        params.context,
      );
    }
  }

  if (params.category === 'permission') {
    return withActionPrefix(
      'Permission denied by Supabase (likely RLS). Check Row Level Security policies for this table/view and the current user role.',
      params.context,
    );
  }

  if (params.category === 'auth') {
    // Prefer the raw message if it's already user friendly.
    if (rawMessage && rawMessage.length <= 120) return withActionPrefix(rawMessage, params.context);
    return withActionPrefix('Your session is not valid. Please sign in again.', params.context);
  }

  if (params.category === 'network') {
    return withActionPrefix('Network error while contacting Supabase. Check your connection and Supabase URL.', params.context);
  }

  if (rawMessage) return withActionPrefix(rawMessage, params.context);

  const fallback = params.context?.fallbackMessage?.trim();
  return withActionPrefix(fallback || 'Something went wrong.', params.context);
};

export const normalizeError = (error: unknown, context?: ErrorContext): AppError => {
  if (error instanceof AppError) return error;

  const message = getBaseMessage(error);
  const code = getCode(error);
  const status = getStatus(error);
  const details = getDetails(error);
  const hint = getHint(error);
  const category = classifyError({ message, code, status });
  const actionableMessage = buildActionableMessage({ category, message, code, status, details, hint, context });

  return new AppError({
    category,
    message: actionableMessage,
    code,
    status,
    details,
    hint,
    cause: error,
  });
};

export const getErrorMessage = (error: unknown, fallbackMessage: string): string =>
  normalizeError(error, { fallbackMessage }).message;
