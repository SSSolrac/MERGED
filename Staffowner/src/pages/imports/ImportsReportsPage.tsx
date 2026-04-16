import { useCallback, useEffect, useMemo, useState } from 'react';
import { CsvImportPanel, DateRangeFilter } from '@/components/dashboard';
import { csvImportService } from '@/services/csvImportService';
import type { DateRangePreset } from '@/types/dashboard';
import { formatCurrency } from '@/utils/currency';

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
        <h3 className="font-medium">Import History</h3>
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
              {history.map((item) => (
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
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-2">
        <h3 className="font-medium">Previous Sales History</h3>
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
              {filteredSalesRows.map((row) => (
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
      </section>
    </div>
  );
};