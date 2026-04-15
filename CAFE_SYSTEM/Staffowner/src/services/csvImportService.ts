import type { CsvImportType, CsvValidationResult, DateRangePreset, SalesImportMergeResult, SalesImportPreview } from '@/types/dashboard';
import { normalizeError } from '@/lib/errors';
import { asRecord } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';

type SalesDownloadRow = {
  date: string;
  grossSale: number;
  refunds: number;
  discounts: number;
  netSales: number;
  costOfGoods: number;
  grossProfit: number;
  margin: number;
  taxes: number;
};

type SalesAggregateRow = {
  grossSale: number;
  refunds: number;
  discounts: number;
  netSales: number;
};

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes inside quoted fields.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const normalizeHeader = (header: string) =>
  header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const asTrimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());

const pickFirst = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = asTrimmed(row[key]);
    if (value) return value;
  }
  return '';
};

const parseNumeric = (value: string): number | null => {
  const cleaned = value.replace(/[,\s\u20B1$%]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDateIso = (value: string): string | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const toCsvNumber = (value: number) => roundMoney(Number.isFinite(value) ? value : 0).toFixed(2);

const csvEscape = (value: string) => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const toDateKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const rangeToStartMs = (range: DateRangePreset): number | null => {
  if (range === 'all') return null;
  const now = new Date();
  const start = new Date(now);

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }

  if (range === '7d') start.setDate(start.getDate() - 7);
  else if (range === '30d') start.setDate(start.getDate() - 30);
  else if (range === '90d') start.setDate(start.getDate() - 90);
  else if (range === '3m') start.setMonth(start.getMonth() - 3);
  else if (range === '6m') start.setMonth(start.getMonth() - 6);
  else if (range === '1y') start.setFullYear(start.getFullYear() - 1);

  return start.getTime();
};

const isInRange = (value: string, range: DateRangePreset) => {
  const start = rangeToStartMs(range);
  if (start == null) return true;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= start;
};

const normalizeStatus = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const isRefunded = (status: unknown, paymentStatus: unknown) => {
  const orderStatus = normalizeStatus(status);
  const orderPaymentStatus = normalizeStatus(paymentStatus);
  return orderStatus === 'refunded' || orderPaymentStatus === 'refunded';
};

const isCancelled = (status: unknown) => normalizeStatus(status) === 'cancelled';

const normalizeSalesStatus = (value: string) => {
  const raw = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return 'completed';
  if (raw === 'complete') return 'completed';
  if (raw === 'cancel' || raw === 'canceled') return 'cancelled';
  if (raw === 'out_for_delivery' || raw === 'out_for_del') return 'out_for_delivery';
  if (raw === 'completed' || raw === 'delivered' || raw === 'pending' || raw === 'preparing' || raw === 'ready' || raw === 'cancelled' || raw === 'refunded') {
    return raw;
  }
  return 'completed';
};

const normalizePaymentMethod = (value: string) => {
  const raw = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return 'unknown';
  return raw;
};

const normalizeSalesRow = (
  row: Record<string, string>,
): { ok: true; row: Record<string, string> } | { ok: false; reason: string } => {
  const dateText = pickFirst(row, ['date', 'transaction_date', 'order_date', 'business_date']);
  if (!dateText) return { ok: false, reason: 'Missing required value: date.' };
  const dateIso = parseDateIso(dateText);
  if (!dateIso) return { ok: false, reason: `Invalid date value: ${dateText}` };

  // Accept both transaction-style CSV and daily-summary accounting CSV.
  const grossText = pickFirst(row, ['gross_sales', 'gross_sale', 'sales_total', 'total_sales', 'sales']);
  const refundsText = pickFirst(row, ['refunds', 'refund', 'refund_total']);
  const discountsText = pickFirst(row, ['discounts', 'discount', 'discount_total']);
  const netText = pickFirst(row, ['net_sales', 'net_sale']);
  const cogsText = pickFirst(row, ['cost_of_goods', 'cost_of_gog', 'cogs', 'cost']);
  const grossProfitText = pickFirst(row, ['gross_profit', 'gross_prof', 'profit']);
  const marginText = pickFirst(row, ['margin', 'margin_pct']);
  const taxesText = pickFirst(row, ['taxes', 'tax', 'tax_total']);

  const grossParsed = grossText ? parseNumeric(grossText) : null;
  const refundsParsed = refundsText ? parseNumeric(refundsText) : null;
  const discountsParsed = discountsText ? parseNumeric(discountsText) : null;
  const netParsed = netText ? parseNumeric(netText) : null;
  const cogsParsed = cogsText ? parseNumeric(cogsText) : null;
  const grossProfitParsed = grossProfitText ? parseNumeric(grossProfitText) : null;
  const marginParsed = marginText ? parseNumeric(marginText) : null;
  const taxesParsed = taxesText ? parseNumeric(taxesText) : null;

  if (grossText && grossParsed == null) return { ok: false, reason: `Invalid gross sales value: ${grossText}` };
  if (refundsText && refundsParsed == null) return { ok: false, reason: `Invalid refunds value: ${refundsText}` };
  if (discountsText && discountsParsed == null) return { ok: false, reason: `Invalid discounts value: ${discountsText}` };
  if (netText && netParsed == null) return { ok: false, reason: `Invalid net sales value: ${netText}` };
  if (cogsText && cogsParsed == null) return { ok: false, reason: `Invalid cost of goods value: ${cogsText}` };
  if (grossProfitText && grossProfitParsed == null) return { ok: false, reason: `Invalid gross profit value: ${grossProfitText}` };
  if (marginText && marginParsed == null) return { ok: false, reason: `Invalid margin value: ${marginText}` };
  if (taxesText && taxesParsed == null) return { ok: false, reason: `Invalid taxes value: ${taxesText}` };

  const refunds = Math.max(0, refundsParsed ?? 0);
  const discounts = Math.max(0, discountsParsed ?? 0);
  const gross =
    grossParsed != null
      ? Math.max(0, grossParsed)
      : netParsed != null
        ? Math.max(0, netParsed + discounts + refunds)
        : null;

  if (gross == null) return { ok: false, reason: 'Missing required value: gross_sales or net_sales.' };

  const net = netParsed != null ? Math.max(0, netParsed) : Math.max(0, gross - discounts - refunds);
  const costOfGoods = Math.max(0, cogsParsed ?? 0);
  const grossProfit = grossProfitParsed != null ? grossProfitParsed : net - costOfGoods;
  const margin = marginParsed != null ? marginParsed : net > 0 ? (grossProfit / net) * 100 : 0;
  const taxes = Math.max(0, taxesParsed ?? 0);

  const paymentMethodText = pickFirst(row, ['payment_method', 'payment', 'payment_type', 'mode_of_payment']);
  const statusText = pickFirst(row, ['status', 'order_status']);
  const customerCode = pickFirst(row, ['customer_code', 'customer_id']);
  const itemCode = pickFirst(row, ['item_code', 'menu_item_code', 'product_code']);

  return {
    ok: true,
    row: {
      date: dateIso,
      sales_total: net.toFixed(2),
      gross_sales: gross.toFixed(2),
      refunds_total: refunds.toFixed(2),
      discounts_total: discounts.toFixed(2),
      net_sales: net.toFixed(2),
      cost_of_goods: costOfGoods.toFixed(2),
      gross_profit: grossProfit.toFixed(2),
      margin_pct: margin.toFixed(2),
      taxes_total: taxes.toFixed(2),
      payment_method: normalizePaymentMethod(paymentMethodText),
      status: normalizeSalesStatus(statusText),
      customer_code: customerCode,
      item_code: itemCode,
    },
  };
};

const getDateBounds = (rows: Record<string, string>[]) => {
  if (!rows.length) return undefined;
  const dates = rows.map((row) => row.date).filter(Boolean);
  if (!dates.length) return undefined;
  return {
    start: String(dates.reduce((min, value) => (value < min ? value : min), dates[0])),
    end: String(dates.reduce((max, value) => (value > max ? value : max), dates[0])),
  };
};

export const csvImportService = {
  async parseCsvFile(file: File): Promise<Record<string, string>[]> {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const rawHeaders = splitCsvLine(lines[0]);
    const headers = rawHeaders.map((header, index) => {
      const trimmed = asTrimmed(header);
      return trimmed || `column_${index + 1}`;
    });
    const normalizedHeaders = headers.map(normalizeHeader);

    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      return headers.reduce<Record<string, string>>((acc, header, index) => {
        const value = values[index] ?? '';
        acc[header] = value;

        const normalized = normalizedHeaders[index];
        if (normalized && !(normalized in acc)) {
          acc[normalized] = value;
        }

        return acc;
      }, {});
    });
  },

  validateImportedRows(type: CsvImportType, rows: Record<string, string>[]): CsvValidationResult {
    if (type !== 'sales') {
      const requiredColumns: Record<Exclude<CsvImportType, 'sales'>, string[]> = {
        orders: ['order_id', 'customer_name', 'total', 'status'],
        customers: ['customer_id', 'name', 'email'],
        'menu-items': ['item_name', 'category', 'price'],
      };
      const required = requiredColumns[type];
      const invalidRows: CsvValidationResult['invalidRows'] = [];
      const validRows: CsvValidationResult['validRows'] = [];

      rows.forEach((row, index) => {
        const missing = required.filter((column) => !asTrimmed(row[column]));
        if (missing.length) {
          invalidRows.push({ rowNumber: index + 2, reason: `Missing required column values: ${missing.join(', ')}`, row });
          return;
        }
        validRows.push(row);
      });

      return { validRows, invalidRows };
    }

    const invalidRows: CsvValidationResult['invalidRows'] = [];
    const validRows: CsvValidationResult['validRows'] = [];

    rows.forEach((row, index) => {
      const normalized = normalizeSalesRow(row);
      if (!normalized.ok) {
        invalidRows.push({ rowNumber: index + 2, reason: normalized.reason, row });
        return;
      }
      validRows.push(normalized.row);
    });

    return { validRows, invalidRows };
  },

  async previewSalesImport(rows: Record<string, string>[]): Promise<SalesImportPreview> {
    const { validRows, invalidRows } = this.validateImportedRows('sales', rows);

    return {
      validRows,
      invalidRows,
      summary: { totalRows: rows.length, validCount: validRows.length, invalidCount: invalidRows.length },
    };
  },

  async importSales(rows: Record<string, string>[], options?: { fileName?: string }): Promise<SalesImportMergeResult> {
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { validRows, invalidRows } = this.validateImportedRows('sales', rows);

    const asImportError = (error: unknown, fallback = 'Import failed.') => normalizeError(error, { fallbackMessage: fallback });

    const findMissingColumn = (error: unknown, relation: string) => {
      const message = String(asRecord(error)?.message ?? (error instanceof Error ? error.message : ''));
      const match = message.match(new RegExp(`column \\"(?<column>[a-zA-Z0-9_]+)\\" of relation \\"${relation}\\" does not exist`, 'i'));
      return match?.groups?.column ?? null;
    };

    const insertWithFallback = async (relation: string, payload: Record<string, unknown>) => {
      let attemptPayload = { ...payload };
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data, error } = await supabase.from(relation).insert(attemptPayload).select('*').single();
        if (!error) return data;
        lastError = error;

        const missing = findMissingColumn(error, relation);
        if (!missing || !(missing in attemptPayload)) break;

        const { [missing]: _removed, ...next } = attemptPayload;
        attemptPayload = next;
      }

      throw lastError;
    };

    const user = await supabase.auth.getUser();
    if (user.error) throw asImportError(user.error, 'Unable to load session.');

    const batchPayload: Record<string, unknown> = {
      type: 'sales',
      file_name: options?.fileName ?? null,
      total_rows: rows.length,
      valid_rows: validRows.length,
      invalid_rows: invalidRows.length,
      created_by: user.data.user?.id ?? null,
      created_at: now,
    };

    let batchRow: Record<string, unknown>;
    try {
      batchRow = (await insertWithFallback('sales_import_batches', batchPayload)) as Record<string, unknown>;
    } catch (error) {
      throw asImportError(error, 'Unable to create import batch.');
    }

    const batchId = String(batchRow.id ?? '');

    if (invalidRows.length) {
      const errorRows = invalidRows.map((row) => ({
        batch_id: batchId || null,
        row_number: row.rowNumber,
        reason: row.reason,
        raw_row: row.row,
        created_at: now,
      }));

      const { error } = await supabase.from('import_errors').insert(errorRows);
      if (error) throw asImportError(error, 'Unable to write import errors.');
    }

    if (validRows.length) {
      const salesRows = validRows.map((row) => ({
        batch_id: batchId || null,
        date: row.date,
        sales_total: Number(row.sales_total ?? 0),
        gross_sales: Number(row.gross_sales ?? row.sales_total ?? 0),
        refunds_total: Number(row.refunds_total ?? 0),
        discounts_total: Number(row.discounts_total ?? 0),
        net_sales: Number(row.net_sales ?? row.sales_total ?? 0),
        cost_of_goods: Number(row.cost_of_goods ?? 0),
        gross_profit: Number(row.gross_profit ?? 0),
        margin_pct: Number(row.margin_pct ?? 0),
        taxes_total: Number(row.taxes_total ?? 0),
        payment_method: row.payment_method || 'unknown',
        status: row.status || 'completed',
        customer_code: row.customer_code || null,
        item_code: row.item_code || null,
        created_at: now,
      }));

      let payloadRows = salesRows;
      let writeError: unknown = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { error } = await supabase.from('imported_sales_rows').insert(payloadRows);
        if (!error) {
          writeError = null;
          break;
        }

        writeError = error;
        const missing = findMissingColumn(error, 'imported_sales_rows');
        if (!missing || !(missing in (payloadRows[0] ?? {}))) break;

        payloadRows = payloadRows.map((entry) => {
          const { [missing]: _removed, ...next } = entry;
          return next;
        });
      }

      if (writeError) throw asImportError(writeError, 'Unable to write imported sales rows.');
    }

    return {
      added: validRows.length,
      updated: 0,
      skipped: 0,
      affectedDateRange: getDateBounds(validRows),
    };
  },

  async buildSalesDataCsv(range: DateRangePreset = 'all'): Promise<{ fileName: string; csv: string; rowCount: number }> {
    const supabase = requireSupabaseClient();
    const asExportError = (error: unknown, fallback = 'Unable to build sales export.') =>
      normalizeError(error, { fallbackMessage: fallback });

    const fetchAllRows = async (table: 'orders' | 'imported_sales_rows', columns: string) => {
      const pageSize = 1000;
      const rows: Record<string, unknown>[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .order(table === 'orders' ? 'created_at' : 'date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw asExportError(error, `Unable to load ${table} for sales export.`);

        const batch = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return rows;
    };

    const [orderRows, importedRows, settingsResult] = await Promise.all([
      fetchAllRows('orders', 'placed_at, created_at, subtotal, discount_total, total_amount, status, payment_status'),
      fetchAllRows(
        'imported_sales_rows',
        'date, sales_total, gross_sales, refunds_total, discounts_total, net_sales, status',
      ),
      supabase.from('business_settings').select('tax_pct').eq('id', 1).maybeSingle(),
    ]);

    if (settingsResult.error) {
      throw asExportError(settingsResult.error, 'Unable to load business tax settings.');
    }

    const taxPct = Number((settingsResult.data as { tax_pct?: unknown } | null)?.tax_pct ?? 0);
    const aggregate = new Map<string, SalesAggregateRow>();

    const ensureAggregate = (dateKey: string) => {
      if (!aggregate.has(dateKey)) {
        aggregate.set(dateKey, { grossSale: 0, refunds: 0, discounts: 0, netSales: 0 });
      }
      return aggregate.get(dateKey)!;
    };

    orderRows.forEach((row) => {
      const occurredAt = String((row.placed_at ?? row.created_at) ?? '');
      if (!occurredAt || !isInRange(occurredAt, range)) return;
      if (isCancelled(row.status)) return;

      const dateKey = toDateKey(occurredAt);
      if (!dateKey) return;

      const subtotal = Math.max(0, Number(row.subtotal ?? 0) || 0);
      const discounts = Math.max(0, Number(row.discount_total ?? 0) || 0);
      const totalAmount = Math.max(0, Number(row.total_amount ?? 0) || 0);
      const grossSale = subtotal > 0 ? subtotal : Math.max(totalAmount + discounts, totalAmount);
      const refunds = isRefunded(row.status, row.payment_status)
        ? (totalAmount > 0 ? totalAmount : Math.max(grossSale - discounts, 0))
        : 0;
      const netSales = Math.max(grossSale - discounts - refunds, 0);

      const target = ensureAggregate(dateKey);
      target.grossSale += grossSale;
      target.refunds += refunds;
      target.discounts += discounts;
      target.netSales += netSales;
    });

    importedRows.forEach((row) => {
      const occurredAt = String(row.date ?? '');
      if (!occurredAt || !isInRange(occurredAt, range)) return;
      if (isCancelled(row.status)) return;

      const dateKey = toDateKey(occurredAt);
      if (!dateKey) return;

      const parsedGross = Math.max(0, Number(row.gross_sales ?? 0) || 0);
      const parsedRefunds = Math.max(0, Number(row.refunds_total ?? 0) || 0);
      const parsedDiscounts = Math.max(0, Number(row.discounts_total ?? 0) || 0);
      const parsedNet = Math.max(0, Number(row.net_sales ?? row.sales_total ?? 0) || 0);

      const grossSale =
        parsedGross > 0
          ? parsedGross
          : Math.max(
              parsedNet + parsedDiscounts + parsedRefunds,
              Math.max(0, Number(row.sales_total ?? 0) || 0),
            );
      const refunds = parsedRefunds > 0 ? parsedRefunds : isRefunded(row.status, null) ? grossSale : 0;
      const discounts = parsedDiscounts;
      const netSales = parsedNet > 0 ? parsedNet : Math.max(grossSale - discounts - refunds, 0);

      const target = ensureAggregate(dateKey);
      target.grossSale += grossSale;
      target.refunds += refunds;
      target.discounts += discounts;
      target.netSales += netSales;
    });

    const rows: SalesDownloadRow[] = Array.from(aggregate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => {
        const grossSale = roundMoney(row.grossSale);
        const refunds = roundMoney(row.refunds);
        const discounts = roundMoney(row.discounts);
        const netSales = roundMoney(row.netSales);
        const costOfGoods = 0;
        const grossProfit = roundMoney(netSales - costOfGoods);
        const margin = netSales > 0 ? roundMoney((grossProfit / netSales) * 100) : 0;
        const taxes = roundMoney(netSales * (Number.isFinite(taxPct) ? taxPct / 100 : 0));

        return {
          date,
          grossSale,
          refunds,
          discounts,
          netSales,
          costOfGoods,
          grossProfit,
          margin,
          taxes,
        };
      });

    const headers = ['Date', 'Gross sale', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit', 'Margin', 'Taxes'];
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        [
          csvEscape(row.date),
          toCsvNumber(row.grossSale),
          toCsvNumber(row.refunds),
          toCsvNumber(row.discounts),
          toCsvNumber(row.netSales),
          toCsvNumber(row.costOfGoods),
          toCsvNumber(row.grossProfit),
          `${toCsvNumber(row.margin)}%`,
          toCsvNumber(row.taxes),
        ].join(','),
      ),
    ];

    const dayStamp = new Date().toISOString().slice(0, 10);
    const csv = lines.join('\r\n');
    return {
      fileName: `sales-data-${range}-${dayStamp}.csv`,
      csv,
      rowCount: rows.length,
    };
  },

  async listHistory(): Promise<Array<{ id: string; type: string; totalRows: number; validRows: number; invalidRows: number; importedAt: string }>> {
    try {
      const supabase = requireSupabaseClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('sales_import_batches').select('*').order('created_at', { ascending: false });
      if (error) return [];

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: String((row as { id?: unknown }).id ?? ''),
        type: String((row as { type?: unknown }).type ?? 'sales'),
        totalRows: Number((row as { total_rows?: unknown; totalRows?: unknown }).total_rows ?? (row as { totalRows?: unknown }).totalRows ?? 0),
        validRows: Number((row as { valid_rows?: unknown; validRows?: unknown }).valid_rows ?? (row as { validRows?: unknown }).validRows ?? 0),
        invalidRows: Number((row as { invalid_rows?: unknown; invalidRows?: unknown }).invalid_rows ?? (row as { invalidRows?: unknown }).invalidRows ?? 0),
        importedAt: String(
          (row as { created_at?: unknown; imported_at?: unknown; importedAt?: unknown }).created_at
            ?? (row as { imported_at?: unknown }).imported_at
            ?? (row as { importedAt?: unknown }).importedAt
            ?? now,
        ),
      }));
    } catch {
      return [];
    }
  },

  async listImportedSalesRows(limit = 200): Promise<
    Array<{
      id: string;
      batchId: string;
      date: string;
      salesTotal: number;
      grossSales: number;
      refundsTotal: number;
      discountsTotal: number;
      netSales: number;
      costOfGoods: number;
      grossProfit: number;
      marginPct: number;
      taxesTotal: number;
      paymentMethod: string;
      status: string;
      customerCode: string | null;
      itemCode: string | null;
      createdAt: string;
    }>
  > {
    try {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.from('imported_sales_rows').select('*').order('date', { ascending: false }).limit(limit);
      if (error) return [];

      return (Array.isArray(data) ? data : []).map((row) => ({
        id: String((row as { id?: unknown }).id ?? ''),
        batchId: String((row as { batch_id?: unknown; batchId?: unknown }).batch_id ?? (row as { batchId?: unknown }).batchId ?? ''),
        date: String((row as { date?: unknown }).date ?? ''),
        salesTotal: Number((row as { sales_total?: unknown; salesTotal?: unknown }).sales_total ?? (row as { salesTotal?: unknown }).salesTotal ?? 0),
        grossSales: Number((row as { gross_sales?: unknown; grossSales?: unknown }).gross_sales ?? (row as { grossSales?: unknown }).grossSales ?? 0),
        refundsTotal: Number((row as { refunds_total?: unknown; refundsTotal?: unknown }).refunds_total ?? (row as { refundsTotal?: unknown }).refundsTotal ?? 0),
        discountsTotal: Number((row as { discounts_total?: unknown; discountsTotal?: unknown }).discounts_total ?? (row as { discountsTotal?: unknown }).discountsTotal ?? 0),
        netSales: Number((row as { net_sales?: unknown; netSales?: unknown }).net_sales ?? (row as { netSales?: unknown }).netSales ?? 0),
        costOfGoods: Number((row as { cost_of_goods?: unknown; costOfGoods?: unknown }).cost_of_goods ?? (row as { costOfGoods?: unknown }).costOfGoods ?? 0),
        grossProfit: Number((row as { gross_profit?: unknown; grossProfit?: unknown }).gross_profit ?? (row as { grossProfit?: unknown }).grossProfit ?? 0),
        marginPct: Number((row as { margin_pct?: unknown; marginPct?: unknown }).margin_pct ?? (row as { marginPct?: unknown }).marginPct ?? 0),
        taxesTotal: Number((row as { taxes_total?: unknown; taxesTotal?: unknown }).taxes_total ?? (row as { taxesTotal?: unknown }).taxesTotal ?? 0),
        paymentMethod: String((row as { payment_method?: unknown; paymentMethod?: unknown }).payment_method ?? (row as { paymentMethod?: unknown }).paymentMethod ?? 'unknown'),
        status: String((row as { status?: unknown }).status ?? 'completed'),
        customerCode: (() => {
          const value = (row as { customer_code?: unknown; customerCode?: unknown }).customer_code ?? (row as { customerCode?: unknown }).customerCode;
          return value == null ? null : String(value);
        })(),
        itemCode: (() => {
          const value = (row as { item_code?: unknown; itemCode?: unknown }).item_code ?? (row as { itemCode?: unknown }).itemCode;
          return value == null ? null : String(value);
        })(),
        createdAt: String((row as { created_at?: unknown; createdAt?: unknown }).created_at ?? (row as { createdAt?: unknown }).createdAt ?? ''),
      }));
    } catch {
      return [];
    }
  },
};
