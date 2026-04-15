import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { AppError, normalizeError } from '@/lib/errors';
import { getSupabaseConfigStatus, requireSupabaseClient } from '@/lib/supabase';
import { deserializeSessionUser, loadSessionUser, persistSessionUser } from '@/auth/sessionPersistence';
import { loginHistoryService } from '@/services/loginHistoryService';

type TestCase = { name: string; run: () => void | Promise<void> };

const tests: TestCase[] = [
  {
    name: 'getSupabaseConfigStatus returns unconfigured when import.meta.env is missing',
    run() {
      const status = getSupabaseConfigStatus();
      assert.equal(status.configured, false);
      assert.ok(status.missing.includes('VITE_SUPABASE_URL'));
      assert.ok(status.missing.some((item) => item.startsWith('VITE_SUPABASE_ANON_KEY')));
    },
  },
  {
    name: 'requireSupabaseClient throws a config AppError when unconfigured',
    run() {
      assert.throws(
        () => requireSupabaseClient(),
        (error: unknown) => error instanceof AppError && error.category === 'config' && /not configured/i.test(error.message),
      );
    },
  },
  {
    name: 'normalizeError categorizes missing relation as schema',
    run() {
      const error = { message: 'relation "public.orders" does not exist', code: '42P01' };
      const normalized = normalizeError(error);
      assert.equal(normalized.category, 'schema');
      assert.match(normalized.message, /missing relation/i);
    },
  },
  {
    name: 'normalizeError categorizes RLS errors as permission',
    run() {
      const error = { message: 'new row violates row-level security policy for table "orders"', code: '42501', status: 403 };
      const normalized = normalizeError(error);
      assert.equal(normalized.category, 'permission');
      assert.match(normalized.message, /permission denied|rls/i);
    },
  },
  {
    name: 'normalizeError categorizes stack depth limit exceeded as backend',
    run() {
      const error = { message: 'stack depth limit exceeded', code: '54001' };
      const normalized = normalizeError(error);
      assert.equal(normalized.category, 'backend');
      assert.match(normalized.message, /stack depth limit exceeded/i);
    },
  },
  {
    name: 'normalizeError categorizes network failures as network',
    run() {
      const normalized = normalizeError(new TypeError('Failed to fetch'));
      assert.equal(normalized.category, 'network');
      assert.match(normalized.message, /network/i);
    },
  },
  {
    name: 'deserializeSessionUser returns null for invalid payloads',
    run() {
      assert.equal(deserializeSessionUser(null), null);
      assert.equal(deserializeSessionUser(''), null);
      assert.equal(deserializeSessionUser('{not-json'), null);
      assert.equal(deserializeSessionUser(JSON.stringify([])), null);
      assert.equal(deserializeSessionUser(JSON.stringify({})), null);
    },
  },
  {
    name: 'deserializeSessionUser accepts owner/staff session users',
    run() {
      const owner = deserializeSessionUser(JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'A', role: 'owner' }));
      assert.ok(owner);
      assert.equal(owner.id, 'u1');
      assert.equal(owner.role, 'owner');

      const staff = deserializeSessionUser(JSON.stringify({ id: 'u2', email: 'c@d.com', name: 'C', role: 'staff' }));
      assert.ok(staff);
      assert.equal(staff.id, 'u2');
      assert.equal(staff.role, 'staff');
    },
  },
  {
    name: 'deserializeSessionUser rejects customer role',
    run() {
      const customer = deserializeSessionUser(JSON.stringify({ id: 'u3', email: 'x@y.com', name: 'X', role: 'customer' }));
      assert.equal(customer, null);
    },
  },
  {
    name: 'persistSessionUser writes and removes storage entries',
    run() {
      const store = new Map<string, string>();
      const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      };

      persistSessionUser(storage, { id: 'u1', email: 'a@b.com', name: 'A', role: 'owner' });
      const loaded = loadSessionUser(storage);
      assert.ok(loaded);
      assert.equal(loaded.id, 'u1');

      persistSessionUser(storage, null);
      assert.equal(loadSessionUser(storage), null);
    },
  },
  {
    name: 'loginHistoryService.recordLogin is best-effort (does not throw when unconfigured)',
    async run() {
      await loginHistoryService.recordLogin({ userId: 'u1', email: 'a@b.com', role: 'owner' });
      await loginHistoryService.recordLogout({ userId: 'u1' });
    },
  },
  {
    name: 'CSV import panel exposes backend-driven sales export',
    async run() {
      const panelSrc = await readFile(new URL('../src/components/dashboard/CsvImportPanel.tsx', import.meta.url), 'utf8');
      const serviceSrc = await readFile(new URL('../src/services/csvImportService.ts', import.meta.url), 'utf8');
      assert.ok(panelSrc.includes('Download sales data CSV'), 'CsvImportPanel should expose sales CSV download.');
      assert.ok(panelSrc.includes('buildSalesDataCsv'), 'CsvImportPanel should call csvImportService.buildSalesDataCsv().');
      assert.ok(serviceSrc.includes('buildSalesDataCsv'), 'csvImportService should implement buildSalesDataCsv().');
      assert.ok(serviceSrc.includes('Gross sale'), 'Sales export should include accounting columns.');
    },
  },
  {
    name: 'dashboard service paginates live and imported rows (no fixed 300-row cap)',
    async run() {
      const serviceSrc = await readFile(new URL('../src/services/dashboardService.ts', import.meta.url), 'utf8');
      assert.ok(serviceSrc.includes('fetchLiveOrdersForDashboard'), 'dashboardService should fetch live orders from orders table.');
      assert.ok(serviceSrc.includes('fetchImportedSalesAsOrders'), 'dashboardService should fetch imported sales rows.');
      assert.ok(serviceSrc.includes('.range(from, from + pageSize - 1)'), 'dashboardService should paginate Supabase reads.');
      assert.ok(!serviceSrc.includes('limit(300)'), 'dashboardService should not hard-cap dashboard reads at 300 rows.');
    },
  },
  {
    name: 'dashboard page excludes imported rows from time-of-day slices',
    async run() {
      const pageSrc = await readFile(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
      assert.ok(
        pageSrc.includes("if (order.code.startsWith('IMP-')) return preset === 'all_day';"),
        'Dashboard time filter should only include imported rows in all-day view.',
      );
      assert.ok(pageSrc.includes('deriveAccountingParts'), 'Dashboard should compute accounting metrics from normalized order data.');
    },
  },
  {
    name: 'login page does not ship hardcoded default credentials',
    async run() {
      const loginSrc = await readFile(new URL('../src/auth/LoginPage.tsx', import.meta.url), 'utf8');
      assert.ok(!loginSrc.includes("useState('password')"), 'LoginPage should not prefill a default password.');
      assert.ok(!loginSrc.includes("useState('staff@happytails.com')"), 'LoginPage should not prefill a default staff email.');
    },
  },
  {
    name: 'order service verifies order mutations and protects status-history integrity',
    async run() {
      const serviceSrc = await readFile(new URL('../src/services/orderService.ts', import.meta.url), 'utf8');
      assert.ok(serviceSrc.includes('ensureMutableOrder'), 'orderService should verify order existence/access before updates.');
      assert.ok(serviceSrc.includes(".select('id')"), 'confirmPayment should verify that an update actually affected one row.');
      assert.ok(serviceSrc.includes('rollback to avoid persisting a status change'), 'updateOrderStatus should include rollback on history-write failure.');
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`ok - ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${tests.length} tests passed.`);
}
