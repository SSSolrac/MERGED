function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRuntimeIsDev() {
  return Boolean((import.meta.env ?? {}).DEV);
}

function inferRelationFromMessage(message) {
  const text = asNonEmptyText(message);
  if (!text) return "";

  const patterns = [
    /function ([^\s]+)\(.*\) does not exist/i,
    /rpc ([^\s]+) does not exist/i,
    /relation "([^"]+)" does not exist/i,
    /table "([^"]+)" does not exist/i,
    /Could not find the '([^']+)' table/i,
    /Could not find the '([^']+)' view/i,
    /Could not find the '([^']+)' relation/i,
    /permission denied for relation ([^\s]+)/i,
    /row-level security policy for table "([^"]+)"/i,
    /violates row-level security policy for table "([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return asNonEmptyText(match[1]);
  }

  const schemaCacheMatch = text.match(/Could not find the '([^']+)' table in the schema cache/i);
  if (schemaCacheMatch?.[1]) return asNonEmptyText(schemaCacheMatch[1]);

  return "";
}

function classifySupabaseError({ code, status, message }) {
  const lowered = asNonEmptyText(message).toLowerCase();
  const upperCode = asNonEmptyText(code).toUpperCase();

  if (upperCode === "SUPABASE_CONFIG_MISSING") return "missing_config";
  if (lowered.includes("create_customer_order") && lowered.includes("does not exist")) return "missing_rpc";
  if (lowered.includes("rpc create_customer_order") && lowered.includes("does not exist")) return "missing_rpc";
  if (upperCode === "PGRST302") return "missing_rpc"; // PostgREST missing function
  if (/failed to fetch|networkerror|load failed|fetch failed|econnreset|enotfound|eai_again/i.test(lowered)) return "network_failure";

  // Missing columns show up as 42703 or message-based errors.
  if (upperCode === "42703") return "missing_column";
  if (lowered.includes("column") && lowered.includes("does not exist")) return "missing_column";

  if (upperCode === "42P01" || upperCode === "PGRST205") return "missing_relation";
  if (lowered.includes("does not exist") && lowered.includes("relation")) return "missing_relation";
  if (lowered.includes("schema cache") && lowered.includes("could not find")) return "missing_relation";

  // Auth/session problems.
  if (status === 401) return "auth_failure";
  if (lowered.includes("invalid jwt") || lowered.includes("jwt expired") || lowered.includes("auth session missing")) return "auth_failure";
  if (lowered.includes("invalid refresh token") || lowered.includes("refresh token not found")) return "auth_failure";

  // Permissions / RLS.
  if (upperCode === "42501") return "permission_denied";
  if (status === 403) return "permission_denied";
  if (lowered.includes("permission denied")) return "permission_denied";
  if (lowered.includes("row level security") || lowered.includes("row-level security")) return "permission_denied";
  if (lowered.includes("violates row-level security")) return "permission_denied";

  if (upperCode === "PGRST116") return "no_rows";

  return "unknown";
}

function appendDebugInfo(message, debugInfo) {
  const parts = [];
  if (debugInfo?.code) parts.push(`code=${debugInfo.code}`);
  if (typeof debugInfo?.status === "number") parts.push(`status=${debugInfo.status}`);
  if (debugInfo?.relation) parts.push(`relation=${debugInfo.relation}`);

  if (!parts.length) return message;
  return `${message} (${parts.join(", ")})`;
}

export function normalizeSupabaseError(error, options = {}) {
  const fallbackMessage = asNonEmptyText(options.fallbackMessage) || "Database request failed.";

  if (!error) {
    return {
      kind: "unknown",
      message: fallbackMessage,
      code: null,
      status: null,
      relation: asNonEmptyText(options.relation || options.table),
      details: null,
      hint: null,
    };
  }

  const message = asNonEmptyText(error?.message) || fallbackMessage;
  const code = asNonEmptyText(error?.code) || null;
  const statusRaw = error?.status ?? error?.statusCode ?? null;
  const status = typeof statusRaw === "number" ? statusRaw : Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : null;
  const details = asNonEmptyText(error?.details) || null;
  const hint = asNonEmptyText(error?.hint) || null;

  const inferredRelation = asNonEmptyText(options.relation || options.table) || inferRelationFromMessage(message);
  const kind = classifySupabaseError({ code, status, message });

  let userMessage = fallbackMessage;

  if (kind === "missing_config") {
    userMessage = message;
  } else if (kind === "network_failure") {
    userMessage = `${fallbackMessage} Network error while contacting Supabase. Check your connection and Supabase URL.`;
  } else if (kind === "auth_failure") {
    userMessage = `${fallbackMessage} Your session is no longer valid. Please sign in again.`;
  } else if (kind === "missing_relation") {
    const relationLabel = inferredRelation ? `Missing table/view: ${inferredRelation}. ` : "";
    userMessage = `${fallbackMessage} ${relationLabel}Apply the Supabase schema (see customer/frontend/supabase/unified_schema.sql) and try again.`;
  } else if (kind === "missing_column") {
    const relationLabel = inferredRelation ? ` (${inferredRelation})` : "";
    userMessage = `${fallbackMessage} Backend schema is missing a column${relationLabel}. Apply the Supabase schema (see customer/frontend/supabase/unified_schema.sql) and try again.`;
  } else if (kind === "missing_rpc") {
    const relationLabel = inferredRelation ? `Missing RPC: ${inferredRelation}. ` : "";
    userMessage = `${fallbackMessage} ${relationLabel}Supabase migration may be incomplete. Deploy the canonical schema (customer/frontend/supabase/unified_schema.sql) to create required RPCs.`;
  } else if (kind === "permission_denied") {
    const relationLabel = inferredRelation ? ` (${inferredRelation})` : "";
    userMessage = `${fallbackMessage} Supabase denied access${relationLabel}. Check Row Level Security (RLS) policies and grants for the current role (anon/authenticated).`;
  } else if (kind === "no_rows") {
    userMessage = fallbackMessage;
  } else {
    userMessage = fallbackMessage;
  }

  const includeDebug = typeof options.includeDebug === "boolean" ? options.includeDebug : getRuntimeIsDev();
  if (includeDebug) {
    userMessage = appendDebugInfo(userMessage, {
      code,
      status,
      relation: inferredRelation || null,
    });
  }

  return {
    kind,
    message: userMessage,
    code,
    status,
    relation: inferredRelation || null,
    details,
    hint,
  };
}

export function asSupabaseError(error, options) {
  const normalized = normalizeSupabaseError(error, options);
  const err = new Error(normalized.message);
  err.kind = normalized.kind;
  err.code = normalized.code;
  err.status = normalized.status;
  err.relation = normalized.relation;
  err.details = normalized.details;
  err.hint = normalized.hint;
  err.cause = error;
  return err;
}

export function isSupabaseNoRowsError(error) {
  const code = asNonEmptyText(error?.code).toUpperCase();
  if (code === "PGRST116") return true;
  const message = asNonEmptyText(error?.message).toLowerCase();
  return Boolean(message && message.includes("no rows") && message.includes("returned"));
}
