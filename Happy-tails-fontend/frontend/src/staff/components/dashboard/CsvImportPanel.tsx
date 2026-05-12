import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { csvImportService } from '@/services/csvImportService';
import { useAuth } from '@/hooks/useAuth';
import type { DateRangePreset } from '@/types/dashboard';
import type { SalesImportMergeResult } from '@/types/dashboard';

export const CsvImportPanel = ({
  onImportComplete,
  downloadRange = 'all',
}: {
  onImportComplete?: () => void | Promise<void>;
  downloadRange?: DateRangePreset;
} = {}) => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [invalidRows, setInvalidRows] = useState<Array<{ rowNumber: number; reason: string }>>([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<SalesImportMergeResult | null>(null);
  const headers = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  if (!isOwner) return <section className="rounded-lg border bg-white p-4 text-sm text-[#6B7280]">Only owners can upload historical sales CSV data.</section>;

  return (
    <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4">
      <h3 className="font-medium">Sales CSV Imports</h3>
      <button
        className="border rounded px-2 py-1"
        disabled={downloading}
        onClick={async () => {
          setDownloading(true);
          try {
            const exportData = await csvImportService.buildSalesDataCsv(downloadRange);
            const blob = new Blob([exportData.csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = exportData.fileName;
            anchor.click();
            URL.revokeObjectURL(url);
            toast.success(`Sales CSV downloaded (${exportData.rowCount} row(s)).`);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to download sales CSV.';
            toast.error(message);
          } finally {
            setDownloading(false);
          }
        }}
      >
        {downloading ? 'Preparing CSV...' : 'Download sales data CSV'}
      </button>

      <label className="text-sm block">CSV File
        <input className="block border rounded mt-1 px-2 py-1 w-full" type="file" accept=".csv,text/csv" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setSelectedFileName(file.name);
          setLoading(true);
          try {
            const parsed = await csvImportService.parseCsvFile(file);
            const preview = await csvImportService.previewSalesImport(parsed);
            setRows(parsed);
            setValidRows(preview.validRows);
            setInvalidRows(preview.invalidRows.map((row) => ({ rowNumber: row.rowNumber, reason: row.reason })));
            toast.success(`Preview complete. Valid ${preview.summary.validCount}, invalid ${preview.summary.invalidCount}.`);
          } catch {
            toast.error('Unable to preview CSV file.');
          } finally {
            setLoading(false);
          }
        }} />
      </label>

      <div className="grid sm:grid-cols-3 gap-3 text-sm"><div className="border rounded p-3">Rows parsed: <strong>{rows.length}</strong></div><div className="border rounded p-3">Rows valid: <strong>{validRows.length}</strong></div><div className="border rounded p-3">Rows invalid: <strong>{invalidRows.length}</strong></div></div>

      {result && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm"><p>Rows added: <strong>{result.added}</strong>, updated: <strong>{result.updated}</strong>, skipped: <strong>{result.skipped}</strong>.</p></div>}

      {headers.length > 0 && <div className="overflow-auto border rounded"><table className="w-full text-sm min-w-[560px]"><thead><tr>{headers.map((header) => <th className="text-left p-2 border-b" key={header}>{header}</th>)}</tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={index} className="border-b">{headers.map((header) => <td className="p-2" key={`${index}-${header}`}>{row[header]}</td>)}</tr>)}</tbody></table></div>}

      <button
        className="border rounded px-3 py-1"
        disabled={loading || validRows.length === 0}
        onClick={async () => {
          setLoading(true);
          try {
            const importResult = await csvImportService.importSales(rows, { fileName: selectedFileName || undefined });
            setResult(importResult);
            toast.success(`Import complete: ${importResult.added} added, ${importResult.updated} updated.`);
            if (onImportComplete) {
              await onImportComplete();
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Import failed.';
            toast.error(message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? 'Processing...' : 'Confirm Import'}
      </button>
    </section>
  );
};
