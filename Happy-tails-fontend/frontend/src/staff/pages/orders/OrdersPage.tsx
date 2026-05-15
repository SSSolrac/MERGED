import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DateRangeFilter } from '@/components/dashboard';
import { Button, EmptyState, PaginationControls, PaymentQrPreview, SectionCard, StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/hooks/useAuth';
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

type RiderOption = {
  id: string;
  name: string;
  contact: string;
  vehicleType: string;
  plateNumber: string;
};

const asText = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const riderLabel = (rider: Pick<RiderOption, 'name' | 'contact' | 'vehicleType' | 'plateNumber'> | null) => {
  if (!rider) return 'Waiting for rider assignment';
  const vehicle = [rider.vehicleType, rider.plateNumber].filter(Boolean).join(' ');
  return [rider.name || 'Assigned rider', rider.contact, vehicle].filter(Boolean).join(' | ');
};

const getRiderAssignment = (order: Order | null): RiderOption | null => {
  const deliveryAddress = asRecord(order?.deliveryAddress);
  const assignment = asRecord(
    deliveryAddress?.riderAssignment ||
      deliveryAddress?.rider_assignment ||
      deliveryAddress?.assignedRider ||
      deliveryAddress?.assigned_rider,
  );
  if (!assignment) return null;

  const rider = {
    id: asText(assignment.id || assignment.riderId || assignment.rider_id),
    name: asText(assignment.name || assignment.riderName || assignment.rider_name),
    contact: asText(assignment.contact || assignment.phone || assignment.riderContact || assignment.rider_contact),
    vehicleType: asText(assignment.vehicleType || assignment.vehicle_type || assignment.vehicle),
    plateNumber: asText(assignment.plateNumber || assignment.plate_number || assignment.plate),
  };

  return rider.name || rider.contact || rider.vehicleType || rider.plateNumber ? rider : null;
};

export const OrdersPage = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const { orders, loading, error, query, status, range, page, pageSize, totalOrders, setQuery, setStatus, setRange, setPage, getOrderById, confirmPayment, updateStatus, refresh } =
    useOrders();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [expandedReceiptUrl, setExpandedReceiptUrl] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<RiderOption[]>([]);
  const [riderDraftId, setRiderDraftId] = useState('');
  const [riderLoadError, setRiderLoadError] = useState('');
  const [isAssigningRider, setIsAssigningRider] = useState(false);

  useEffect(() => {
    if (!selectedOrder) {
      setStatusNote('');
      setRiderDraftId('');
      setRiderLoadError('');
      return;
    }
    setStatusDraft(selectedOrder.status);
    setStatusNote('');
  }, [selectedOrder?.id, selectedOrder?.status]);

  useEffect(() => {
    if (!selectedOrder || selectedOrder.orderType !== 'delivery' || !isOwner) {
      setAvailableRiders([]);
      setRiderDraftId('');
      setRiderLoadError('');
      return;
    }

    let cancelled = false;
    const loadRiders = async () => {
      try {
        setRiderLoadError('');
        const supabase = requireSupabaseClient();
        const { data, error: ridersError } = await supabase
          .from('delivery_riders')
          .select('id, name, contact, vehicle_type, plate_number')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (ridersError) throw ridersError;
        if (cancelled) return;

        const riders = (Array.isArray(data) ? data : []).map((row) => ({
          id: String(row.id || ''),
          name: asText(row.name),
          contact: asText(row.contact),
          vehicleType: asText(row.vehicle_type),
          plateNumber: asText(row.plate_number),
        }));
        setAvailableRiders(riders);
        const assigned = getRiderAssignment(selectedOrder);
        setRiderDraftId(assigned?.id && riders.some((rider) => rider.id === assigned.id) ? assigned.id : '');
      } catch (loadError) {
        if (cancelled) return;
        setAvailableRiders([]);
        setRiderDraftId('');
        setRiderLoadError(getErrorMessage(loadError, 'Rider records are unavailable. Apply the delivery_riders schema first.'));
      }
    };

    void loadRiders();
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedOrder]);

  const handleUpdateSelectedOrderStatus = async () => {
    if (!selectedOrder) return;
    if (statusDraft === selectedOrder.status) {
      toast.info('Choose a different status before updating.');
      return;
    }

    try {
      setIsUpdatingStatus(true);
      const note = statusDraft === 'cancelled' ? statusNote.trim() : '';
      const updated = await updateStatus(selectedOrder.id, statusDraft, note || undefined);
      const refreshed = await getOrderById(updated.id);
      setSelectedOrder(refreshed);
      setStatusDraft(refreshed.status);
      setStatusNote('');
      await refresh();
      toast.success('Order status updated.');
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, 'Unable to update order status.'));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAssignRider = async () => {
    if (!selectedOrder || selectedOrder.orderType !== 'delivery') return;
    const rider = availableRiders.find((item) => item.id === riderDraftId);
    if (!rider) {
      toast.info('Choose an active rider first.');
      return;
    }

    try {
      setIsAssigningRider(true);
      const supabase = requireSupabaseClient();
      const assignedAt = new Date().toISOString();
      const existingDeliveryAddress = asRecord(selectedOrder.deliveryAddress) ?? {};
      const riderAssignment = {
        id: rider.id,
        name: rider.name,
        contact: rider.contact,
        vehicleType: rider.vehicleType,
        plateNumber: rider.plateNumber,
        assignedAt,
      };
      const nextDeliveryAddress = {
        ...existingDeliveryAddress,
        riderAssignment,
        assignedRider: riderAssignment,
      };

      const payloadWithRiderColumn = {
        rider_id: rider.id,
        delivery_address: nextDeliveryAddress,
        updated_at: assignedAt,
      };
      let updateResult = await supabase
        .from('orders')
        .update(payloadWithRiderColumn)
        .eq('id', selectedOrder.id)
        .eq('order_type', 'delivery')
        .select('id')
        .maybeSingle();

      if (updateResult.error && /rider_id|column/i.test(String(updateResult.error.message || ''))) {
        updateResult = await supabase
          .from('orders')
          .update({ delivery_address: nextDeliveryAddress, updated_at: assignedAt })
          .eq('id', selectedOrder.id)
          .eq('order_type', 'delivery')
          .select('id')
          .maybeSingle();
      }

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data?.id) throw new Error('Rider assignment did not apply. Refresh and try again.');

      try {
        const { data: authData } = await supabase.auth.getUser();
        await supabase.from('order_status_history').insert({
          order_id: selectedOrder.id,
          status: selectedOrder.status,
          changed_by: authData?.user?.id || null,
          note: `Assigned rider: ${riderLabel(rider)}`,
          changed_at: assignedAt,
        });
      } catch {
        // Assignment is still valid if the optional audit entry fails.
      }

      const refreshed = await getOrderById(selectedOrder.id);
      setSelectedOrder(refreshed);
      await refresh();
      toast.success('Rider assigned to delivery order.');
    } catch (assignError) {
      toast.error(getErrorMessage(assignError, 'Unable to assign rider.'));
    } finally {
      setIsAssigningRider(false);
    }
  };

  const statusSummary = useMemo(
    () =>
      statuses
        .filter((item): item is OrderStatus => item !== 'all')
        .map((item) => ({ status: item, total: orders.filter((order) => order.status === item).length })),
    [orders],
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalOrders / pageSize)), [pageSize, totalOrders]);
  const visibleOrders = orders;
  const selectedRiderAssignment = getRiderAssignment(selectedOrder);

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

        <p className="text-xs text-[#6B7280]">Status counts below are for the current page; the footer count is the server total for this filter.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          {statusSummary.map((item) => (
            <div key={item.status} className="border rounded p-2 capitalize">
              {item.status.replaceAll('_', ' ')}: <strong>{item.total}</strong>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Order History" subtitle="Orders are loaded one server page at a time. Open details for full customer, payment, and item information.">
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
                    <StatusChip label={order.status.replaceAll('_', ' ')} tone={statusTone(order.status)} />
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
        )}
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalOrders} pageSize={pageSize} onPageChange={setPage} itemLabel="orders" />
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
                Close details
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
                {selectedOrder.orderType === 'delivery' ? (
                  <p className="whitespace-normal break-words">
                    <strong>Rider:</strong> {riderLabel(selectedRiderAssignment)}
                  </p>
                ) : null}
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

            <div className="border rounded p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#6B7280]">Current status</p>
                  <div className="mt-1">
                    <StatusChip label={selectedOrder.status.replaceAll('_', ' ')} tone={statusTone(selectedOrder.status)} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end">
                  <label className="text-sm">
                    New status
                    <select
                      className="mt-1 block w-full rounded border px-2 py-2"
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value as OrderStatus)}
                    >
                      {statusUpdateOptions.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" onClick={handleUpdateSelectedOrderStatus} disabled={isUpdatingStatus || statusDraft === selectedOrder.status}>
                    {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                  </Button>
                </div>
              </div>
              {statusDraft === 'cancelled' ? (
                <label className="block text-sm">
                  Cancellation reason (optional)
                  <textarea
                    className="mt-1 block w-full rounded border px-2 py-2"
                    rows={3}
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            {isOwner && selectedOrder.orderType === 'delivery' ? (
              <div className="border rounded p-3 space-y-3">
                <div>
                  <p className="font-medium text-sm">Delivery Rider Assignment</p>
                  <p className="text-xs text-[#6B7280]">Assign one active rider to this delivery order. Customers can see the assignment in tracking and order history.</p>
                </div>
                {riderLoadError ? <p className="text-sm text-red-600">{riderLoadError}</p> : null}
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
                  <label className="text-sm">
                    Rider
                    <select
                      className="mt-1 block w-full rounded border px-2 py-2"
                      value={riderDraftId}
                      onChange={(event) => setRiderDraftId(event.target.value)}
                      disabled={!availableRiders.length || isAssigningRider}
                    >
                      <option value="">{availableRiders.length ? 'Choose active rider' : 'No active riders available'}</option>
                      {availableRiders.map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {riderLabel(rider)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" onClick={handleAssignRider} disabled={!riderDraftId || isAssigningRider}>
                    {isAssigningRider ? 'Assigning...' : 'Assign Rider'}
                  </Button>
                </div>
              </div>
            ) : null}

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
                Close preview
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

