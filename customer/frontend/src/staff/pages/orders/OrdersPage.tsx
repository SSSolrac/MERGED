import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DateRangeFilter } from '@/components/dashboard';
import { Button, EmptyState, PaginationControls, PaymentQrPreview, SectionCard, StatusChip } from '@/components/ui';
import { useOrders } from '@/hooks/useOrders';
import { paymentMethodToLabel } from '@/utils/payment';
import { formatCurrency } from '@/utils/currency';
import { formatDeliveryAddress } from '../../../utils/deliveryAddress';
import type { Order, OrderStatus } from '@/types/order';

const statuses: Array<OrderStatus | 'all'> = [
  'all',
  'pending',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'delivered',
  'cancelled',
  'refunded',
];

const statusUpdateOptions: OrderStatus[] = statuses.filter((value): value is OrderStatus => value !== 'all');
const PAGE_SIZE = 10;

const statusTone = (status: OrderStatus) => {
  if (status === 'completed' || status === 'delivered') return 'success';
  if (status === 'cancelled' || status === 'refunded') return 'danger';
  if (status === 'pending') return 'warning';
  return 'neutral';
};

const asMoney = (value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0;
};

const deliveryFeeForOrder = (order: Order) => {
  if (order.orderType !== 'delivery') return 0;

  const address = order.deliveryAddress;
  if (address && typeof address === 'object' && !Array.isArray(address)) {
    const record = address as Record<string, unknown>;
    const savedFee = asMoney(record.deliveryFee ?? record.delivery_fee);
    if (savedFee > 0) return savedFee;
  }

  return Math.max(0, asMoney(order.totalAmount) - Math.max(0, asMoney(order.subtotal) - asMoney(order.discountTotal)));
};

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

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

export const OrdersPage = () => {
  const { orders, loading, error, query, status, range, setQuery, setStatus, setRange, getOrderById, confirmPayment, updateStatus } =
    useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [expandedReceiptUrl, setExpandedReceiptUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const requestCancellationReason = (orderCode: string) => {
    const response = window.prompt(`Enter cancellation reason for ${orderCode}:`, '');
    if (response === null) return null;
    const trimmed = response.trim();
    if (!trimmed) return '';
    return trimmed;
  };

  const cancelOrderWithReason = async (order: Order) => {
    if (order.status === 'cancelled') return;
    const reason = requestCancellationReason(order.code || order.id);
    if (reason === null) return;
    if (!reason) {
      toast.error('Cancellation reason is required.');
      return;
    }

    const updated = await updateStatus(order.id, 'cancelled', reason);
    if (selectedOrder?.id === order.id) setSelectedOrder(updated);
    toast.success('Order cancelled.');
  };

  const statusSummary = useMemo(
    () =>
      statuses
        .filter((item): item is OrderStatus => item !== 'all')
        .map((item) => ({ status: item, total: orders.filter((order) => order.status === item).length })),
    [orders],
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(orders.length / PAGE_SIZE)), [orders.length]);
  const visibleOrders = useMemo(() => orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [orders, page]);

  useEffect(() => {
    setPage(1);
  }, [query, status, range]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  if (loading) return <p>Loading orders...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <SectionCard title="View Orders" subtitle="Track order progress, confirm payments, and update status in the shared backend." contentClassName="space-y-3">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <DateRangeFilter value={range} onChange={setRange} />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">
            Search
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              placeholder="Order code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Status
            <select className="block border rounded mt-1 px-2 py-1 w-full" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')}>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'All statuses' : value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          {statusSummary.map((item) => (
            <div key={item.status} className="border rounded p-2 capitalize">
              {item.status.replaceAll('_', ' ')}: <strong>{item.total}</strong>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Order History" subtitle="Showing 10 orders by default. Open details for full customer, payment, and item information.">
        {!visibleOrders.length ? (
          <EmptyState title="No orders found" message="Try another status, date range, or search term." />
        ) : (
          <div className="overflow-auto">
        <table className="w-full text-sm min-w-[1220px]">
          <thead>
            <tr className="text-left">
              <th>Order</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map((order) => {
              const itemsCount = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
              const paymentLabel = order.paymentMethod ? paymentMethodToLabel(order.paymentMethod) : '-';
              const orderType = String(order.orderType || 'takeout').replaceAll('_', ' ');

              return (
                <tr className="border-t" key={order.id}>
                  <td className="font-medium">{order.code}</td>
                  <td>{formatDate(order.placedAt || order.createdAt)}</td>
                  <td>{customerLabel(order)}</td>
                  <td className="capitalize">{orderType}</td>
                  <td>{itemsCount} items</td>
                  <td>{formatCurrency(order.totalAmount)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <StatusChip label={order.status.replaceAll('_', ' ')} tone={statusTone(order.status)} />
                      <select
                        className="border rounded px-2 py-1"
                        value={order.status}
                        onChange={async (e) => {
                          const nextStatus = e.target.value as OrderStatus;
                          if (nextStatus === 'cancelled') {
                            await cancelOrderWithReason(order);
                            return;
                          }
                          await updateStatus(order.id, nextStatus);
                          toast.success('Order status updated.');
                        }}
                      >
                        {statusUpdateOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="capitalize">
                    {order.paymentStatus} - {paymentLabel}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const full = await getOrderById(order.id);
                          setSelectedOrder(full);
                          setExpandedReceiptUrl(null);
                        }}
                      >
                        View Details
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={order.paymentStatus === 'paid'}
                        onClick={async () => {
                          const updated = await confirmPayment(order.id);
                          toast.success(updated.paymentStatus === 'paid' ? 'Payment confirmed.' : 'Payment updated.');
                        }}
                      >
                        {order.paymentStatus === 'paid' ? 'Paid' : 'Confirm Payment'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={order.status === 'cancelled'}
                        onClick={async () => {
                          await cancelOrderWithReason(order);
                        }}
                      >
                        {order.status === 'cancelled' ? 'Cancelled' : 'Cancel Order'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        )}
        <PaginationControls page={page} totalPages={totalPages} totalItems={orders.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="orders" />
      </SectionCard>

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20">
          <div className="w-full max-w-4xl rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Order details: {selectedOrder.code}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedOrder(null);
                  setExpandedReceiptUrl(null);
                }}
              >
                Close
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="border rounded p-3 space-y-1">
                <p>
                  <strong>Customer:</strong> {customerLabel(selectedOrder)}
                </p>
                <p>
                  <strong>Email:</strong> {selectedOrder.customer?.email || 'Not provided'}
                </p>
                <p>
                  <strong>Phone:</strong> {selectedOrder.customer?.phone || 'Not provided'}
                </p>
                <p>
                  <strong>Placed:</strong> {new Date(selectedOrder.placedAt).toLocaleString()}
                </p>
                <p className="capitalize">
                  <strong>Payment:</strong> {selectedOrder.paymentStatus} via{' '}
                  {selectedOrder.paymentMethod ? paymentMethodToLabel(selectedOrder.paymentMethod) : '-'}
                </p>
                {selectedOrder.orderType === 'delivery' && (
                  <p className="whitespace-normal break-words">
                    <strong>Delivery address:</strong> {formatDeliveryAddress(selectedOrder.deliveryAddress)}
                  </p>
                )}
              </div>

              <div className="border rounded p-3 space-y-2 text-sm">
                <p className="font-medium">Amount Breakdown</p>
                {(selectedOrder.items ?? []).map((item) => (
                  <p key={item.id}>
                    {item.quantity} x {item.itemName} - {formatCurrency(item.lineTotal || item.quantity * item.unitPrice)}
                  </p>
                ))}
                <p>Subtotal: {formatCurrency(selectedOrder.subtotal)}</p>
                <p>Discount: -{formatCurrency(selectedOrder.discountTotal)}</p>
                {selectedOrder.orderType === 'delivery' ? <p>Delivery fee: {formatCurrency(deliveryFeeForOrder(selectedOrder))}</p> : null}
                <p className="font-semibold">Grand total: {formatCurrency(selectedOrder.totalAmount)}</p>
              </div>
            </div>

            <div className="border rounded p-3 grid md:grid-cols-2 gap-3 items-start">
              <PaymentQrPreview paymentMethod={selectedOrder.paymentMethod} />
              <div>
                <p className="font-medium text-sm mb-2">Payment proof preview</p>
                {selectedOrder.receiptImageUrl ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="block"
                      onClick={() => setExpandedReceiptUrl(selectedOrder.receiptImageUrl)}
                    >
                      <img
                        src={selectedOrder.receiptImageUrl}
                        alt="Payment proof"
                        className="h-36 rounded border object-cover cursor-zoom-in"
                      />
                    </button>
                    <Button variant="outline" size="sm" onClick={() => setExpandedReceiptUrl(selectedOrder.receiptImageUrl)}>
                      Enlarge receipt
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[#6B7280]">No proof attached yet.</p>
                )}
              </div>
            </div>

            <div className="border rounded p-3">
              <p className="font-medium text-sm mb-2">Status timeline</p>
              <div className="space-y-2 text-sm">
                {(selectedOrder.statusTimeline ?? []).map((event) => (
                  <div key={event.id} className="border-l-2 pl-3">
                    <p className="capitalize font-medium">{event.status.replaceAll('_', ' ')}</p>
                    <p className="text-[#6B7280]">{new Date(event.changedAt).toLocaleString()}</p>
                    {event.note && <p className="text-[#6B7280]">{event.note}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-medium text-sm mb-1">Internal order notes</p>
              <textarea className="border rounded w-full px-2 py-1 text-sm" rows={4} value={selectedOrder.notes ?? ''} readOnly />
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={selectedOrder.paymentStatus === 'paid'}
                onClick={async () => {
                  const updated = await confirmPayment(selectedOrder.id);
                  setSelectedOrder(updated);
                  toast.success('Payment confirmed.');
                }}
              >
                {selectedOrder.paymentStatus === 'paid' ? 'Paid' : 'Confirm Payment'}
              </Button>
              <Button
                variant="danger"
                disabled={selectedOrder.status === 'cancelled'}
                onClick={async () => {
                  await cancelOrderWithReason(selectedOrder);
                }}
              >
                {selectedOrder.status === 'cancelled' ? 'Cancelled' : 'Cancel Order'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {expandedReceiptUrl ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setExpandedReceiptUrl(null)}
        >
          <div
            className="w-full max-w-5xl space-y-3 rounded-lg border bg-white p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Receipt preview</h3>
              <Button variant="outline" size="sm" onClick={() => setExpandedReceiptUrl(null)}>
                Close
              </Button>
            </div>
            <img
              src={expandedReceiptUrl}
              alt="Expanded payment proof"
              className="max-h-[80vh] w-full rounded border object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

