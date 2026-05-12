import { useCallback, useEffect, useMemo, useState } from 'react';
import { CsvImportPanel, DateRangeFilter } from '@/components/dashboard';
import { csvImportService } from '@/services/csvImportService';
import type { DateRangePreset } from '@/types/dashboard';
import { formatCurrency } from '@/utils/currency';

const HISTORY_PAGE_SIZE = 10;
const SALES_PAGE_SIZE = 10;
const paginationButtonClass =
  'rounded-lg border border-[#F3D6DB] bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-[#FFF3F5] disabled:cursor-not-allowed disabled:opacity-50';

const rangeStart = (range: DateRangePreset) => {
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

export const ImportsReportsPage = () => {
  const [range, setRange] = useState<DateRangePreset>('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [history, setHistory] = useState<Array<{ id: string; type: string; totalRows: number; validRows: number; invalidRows: number; importedAt: string }>>([]);
  const [salesRows, setSalesRows] = useState<
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
  >([]);

  const loadImportData = useCallback(async () => {
    const [historyRows, importedRows] = await Promise.all([csvImportService.listHistory(), csvImportService.listImportedSalesRows(300)]);
    setHistory(historyRows);
    setSalesRows(importedRows);
  }, []);

  useEffect(() => {
    void loadImportData();
  }, [loadImportData]);

  const filteredSalesRows = useMemo(() => {
    const start = rangeStart(range);
    if (start == null) return salesRows;
    return salesRows.filter((row) => {
      const parsed = new Date(row.date).getTime();
      return Number.isFinite(parsed) && parsed >= start;
    });
  }, [range, salesRows]);

  const historyTotalPages = useMemo(() => Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE)), [history]);
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return history.slice(start, start + HISTORY_PAGE_SIZE);
  }, [history, historyPage]);

  const salesTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredSalesRows.length / SALES_PAGE_SIZE)), [filteredSalesRows]);
  const paginatedSalesRows = useMemo(() => {
    const start = (salesPage - 1) * SALES_PAGE_SIZE;
    return filteredSalesRows.slice(start, start + SALES_PAGE_SIZE);
  }, [filteredSalesRows, salesPage]);

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyTotalPages));
  }, [historyTotalPages]);

  useEffect(() => {
    setSalesPage((current) => Math.min(current, salesTotalPages));
  }, [salesTotalPages]);

  useEffect(() => {
    setSalesPage(1);
  }, [range]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Import Sales Data</h2>
          <p className="text-sm text-[#6B7280]">Upload sales CSV files, review validation results, and track import jobs.</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </section>

      <CsvImportPanel onImportComplete={loadImportData} downloadRange={range} />

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Import History</h3>
          <p className="text-sm text-[#6B7280]">{history.length} batch{history.length === 1 ? '' : 'es'} total</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-left">
                <th>Batch ID</th>
                <th>Type</th>
                <th>Total Rows</th>
                <th>Valid</th>
                <th>Invalid</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistory.map((item) => (
                <tr key={item.id} className="border-t">
                  <td>{item.id}</td>
                  <td>{item.type}</td>
                  <td>{item.totalRows}</td>
                  <td>{item.validRows}</td>
                  <td>{item.invalidRows}</td>
                  <td>{new Date(item.importedAt).toLocaleString()}</td>
                </tr>
              ))}
              {!history.length ? (
                <tr className="border-t">
                  <td colSpan={6} className="py-3 text-[#6B7280]">
                    No import batches yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {history.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-[#6B7280]">
              Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}-{Math.min(historyPage * HISTORY_PAGE_SIZE, history.length)} of {history.length}
            </p>
            <div className="flex items-center gap-2">
              <button className={paginationButtonClass} disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>
                Previous
              </button>
              <span className="text-sm text-slate-700">
                Page {historyPage} of {historyTotalPages}
              </span>
              <button className={paginationButtonClass} disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage((page) => page + 1)}>
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">Previous Sales History</h3>
          <p className="text-sm text-[#6B7280]">{filteredSalesRows.length} row{filteredSalesRows.length === 1 ? '' : 's'} in range</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[1320px]">
            <thead>
              <tr className="text-left">
                <th>Date</th>
                <th>Gross Sales</th>
                <th>Refunds</th>
                <th>Discounts</th>
                <th>Net Sales</th>
                <th>Cost of Goods</th>
                <th>Gross Profit</th>
                <th>Margin</th>
                <th>Taxes</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Customer Code</th>
                <th>Item Code</th>
                <th>Batch</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSalesRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td>{new Date(row.date).toLocaleDateString()}</td>
                  <td>{formatCurrency(row.grossSales > 0 ? row.grossSales : row.salesTotal)}</td>
                  <td>{formatCurrency(row.refundsTotal)}</td>
                  <td>{formatCurrency(row.discountsTotal)}</td>
                  <td>{formatCurrency(row.netSales > 0 ? row.netSales : row.salesTotal)}</td>
                  <td>{formatCurrency(row.costOfGoods)}</td>
                  <td>{formatCurrency(row.grossProfit)}</td>
                  <td>{row.marginPct.toFixed(2)}%</td>
                  <td>{formatCurrency(row.taxesTotal)}</td>
                  <td>{row.paymentMethod}</td>
                  <td>{row.status}</td>
                  <td>{row.customerCode || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.batchId}</td>
                </tr>
              ))}
              {!filteredSalesRows.length ? (
                <tr className="border-t">
                  <td colSpan={14} className="py-3 text-[#6B7280]">
                    No imported sales rows found for this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredSalesRows.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-[#6B7280]">
              Showing {(salesPage - 1) * SALES_PAGE_SIZE + 1}-{Math.min(salesPage * SALES_PAGE_SIZE, filteredSalesRows.length)} of {filteredSalesRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button className={paginationButtonClass} disabled={salesPage <= 1} onClick={() => setSalesPage((page) => page - 1)}>
                Previous
              </button>
              <span className="text-sm text-slate-700">
                Page {salesPage} of {salesTotalPages}
              </span>
              <button className={paginationButtonClass} disabled={salesPage >= salesTotalPages} onClick={() => setSalesPage((page) => page + 1)}>
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
