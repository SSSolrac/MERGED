import { formatCurrency } from '@/utils/currency';
import type { Order } from '@/types/order';

const customerLabel = (order: Order) => {
  const profileName = order.customer?.name?.trim();
  if (profileName) return profileName;

  const mappedName = order.customerName?.trim();
  if (mappedName) return mappedName;

  if (order.deliveryAddress && typeof order.deliveryAddress === 'object' && !Array.isArray(order.deliveryAddress)) {
    const fromAddress = (order.deliveryAddress as Record<string, unknown>).name;
    const addressName = typeof fromAddress === 'string' ? fromAddress.trim() : '';
    if (addressName) return addressName;
  }

  return 'Guest';
};

export const RecentOrdersTable = ({ title, rows }: { title: string; rows: Order[] }) => (
  <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3 overflow-auto">
    <h3 className="font-medium">{title}</h3>
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr className="text-left">
          <th>Order</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Total</th>
          <th>Placed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t">
            <td>{row.code}</td>
            <td>{customerLabel(row)}</td>
            <td className="capitalize">{row.status.replaceAll('_', ' ')}</td>
            <td>{formatCurrency(row.totalAmount)}</td>
            <td>{new Date(row.placedAt || row.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);
