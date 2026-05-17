import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, SectionCard, StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

type Rider = {
  id: string;
  name: string;
  contact: string;
  vehicleType: string;
  plateNumber: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type RiderForm = {
  name: string;
  contact: string;
  vehicleType: string;
  plateNumber: string;
  notes: string;
};

const emptyForm: RiderForm = {
  name: '',
  contact: '',
  vehicleType: '',
  plateNumber: '',
  notes: '',
};

const asText = (value: unknown, fallback = '') => (value === null || value === undefined ? fallback : String(value).trim());

const toRider = (row: Record<string, unknown>): Rider => ({
  id: String(row.id || ''),
  name: asText(row.name),
  contact: asText(row.contact),
  vehicleType: asText(row.vehicle_type),
  plateNumber: asText(row.plate_number),
  notes: asText(row.notes),
  isActive: row.is_active !== false,
  createdAt: asText(row.created_at),
  updatedAt: asText(row.updated_at || row.created_at),
});

export const RiderManagementPage = () => {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [form, setForm] = useState<RiderForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRiders = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const supabase = requireSupabaseClient();
      const { data, error: riderError } = await supabase
        .from('delivery_riders')
        .select('id, name, contact, vehicle_type, plate_number, notes, is_active, created_at, updated_at')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

      if (riderError) throw riderError;
      setRiders((Array.isArray(data) ? data : []).map((row) => toRider(row as Record<string, unknown>)));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load riders. Apply the latest Supabase schema to create delivery_riders.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRiders();
  }, [loadRiders]);

  const filteredRiders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return riders.filter((rider) => {
      const matchesSearch =
        !needle ||
        [rider.name, rider.contact, rider.vehicleType, rider.plateNumber]
          .some((value) => value.toLowerCase().includes(needle));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && rider.isActive) ||
        (statusFilter === 'inactive' && !rider.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [query, riders, statusFilter]);

  const activeCount = riders.filter((rider) => rider.isActive).length;

  const handleEdit = (rider: Rider) => {
    setEditingId(rider.id);
    setForm({
      name: rider.name,
      contact: rider.contact,
      vehicleType: rider.vehicleType,
      plateNumber: rider.plateNumber,
      notes: rider.notes,
    });
  };

  const resetForm = () => {
    setEditingId('');
    setForm(emptyForm);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const contact = form.contact.trim();
    if (!name || !contact) {
      toast.error('Rider name and contact are required.');
      return;
    }

    try {
      setSaving(true);
      const supabase = requireSupabaseClient();
      const payload = {
        name,
        contact,
        vehicle_type: form.vehicleType.trim(),
        plate_number: form.plateNumber.trim(),
        notes: form.notes.trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      const request = editingId
        ? supabase.from('delivery_riders').update(payload).eq('id', editingId)
        : supabase.from('delivery_riders').insert(payload);

      const { error: saveError } = await request;
      if (saveError) throw saveError;

      toast.success(editingId ? 'Rider updated.' : 'Rider saved.');
      resetForm();
      await loadRiders();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save rider.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rider: Rider) => {
    try {
      const supabase = requireSupabaseClient();
      const { error: updateError } = await supabase
        .from('delivery_riders')
        .update({ is_active: !rider.isActive, updated_at: new Date().toISOString() })
        .eq('id', rider.id);

      if (updateError) throw updateError;
      setRiders((current) => current.map((item) => (item.id === rider.id ? { ...item, isActive: !item.isActive } : item)));
      toast.success(rider.isActive ? 'Rider set inactive.' : 'Rider reactivated.');
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, 'Unable to update rider status.'));
    }
  };

  if (loading) return <p>Loading riders...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <SectionCard title="Rider Management" subtitle="Owner-managed delivery rider records used when assigning delivery orders.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Total riders</p>
            <p className="text-2xl font-semibold text-[#F23895]">{riders.length}</p>
          </div>
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Active</p>
            <p className="text-2xl font-semibold text-[#F23895]">{activeCount}</p>
          </div>
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Inactive</p>
            <p className="text-2xl font-semibold text-[#F23895]">{riders.length - activeCount}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard title={editingId ? 'Edit Rider' : 'Add Rider'} subtitle="Name and contact are required for order assignment.">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm">
              Name
              <input className="mt-1 block w-full rounded border px-2 py-2" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="block text-sm">
              Contact
              <input className="mt-1 block w-full rounded border px-2 py-2" value={form.contact} onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))} />
            </label>
            <label className="block text-sm">
              Vehicle
              <input className="mt-1 block w-full rounded border px-2 py-2" value={form.vehicleType} onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))} />
            </label>
            <label className="block text-sm">
              Plate Number
              <input className="mt-1 block w-full rounded border px-2 py-2" value={form.plateNumber} onChange={(event) => setForm((current) => ({ ...current, plateNumber: event.target.value.toUpperCase() }))} />
            </label>
            <label className="block text-sm">
              Notes
              <textarea className="mt-1 block w-full rounded border px-2 py-2" rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Rider' : 'Save Rider'}</Button>
              {editingId ? <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button> : null}
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Riders List" subtitle="Inactive riders stay in history but cannot be assigned to new orders." contentClassName="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px]">
            <label className="text-sm">
              Search
              <input
                className="mt-1 block w-full rounded border px-2 py-2"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, phone, vehicle, plate"
              />
            </label>
            <label className="text-sm">
              Status
              <select className="mt-1 block w-full rounded border px-2 py-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="active">Active riders</option>
                <option value="inactive">Inactive riders</option>
                <option value="all">All riders</option>
              </select>
            </label>
          </div>

          {!filteredRiders.length ? (
            <EmptyState title="No riders found" message="Add a rider or adjust the filters." />
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Vehicle</th>
                    <th>Plate</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRiders.map((rider) => (
                    <tr key={rider.id} className="border-t">
                      <td className="font-medium">{rider.name}</td>
                      <td>{rider.contact}</td>
                      <td>{rider.vehicleType || '-'}</td>
                      <td>{rider.plateNumber || '-'}</td>
                      <td>
                        <StatusChip label={rider.isActive ? 'active' : 'inactive'} tone={rider.isActive ? 'success' : 'neutral'} />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(rider)}>Edit</Button>
                          <Button variant={rider.isActive ? 'danger' : 'secondary'} size="sm" onClick={() => handleToggleActive(rider)}>
                            {rider.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
