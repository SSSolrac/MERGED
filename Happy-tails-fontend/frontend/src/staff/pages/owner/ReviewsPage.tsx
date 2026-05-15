import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, SectionCard, StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';
import { formatCurrency } from '@/utils/currency';

type ReviewItem = {
  id: string;
  orderId: string | null;
  customerId: string | null;
  reviewerName: string;
  serviceLabel: string;
  rating: number;
  comment: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  orderCode: string;
  orderType: string;
  orderStatus: string;
  orderTotal: number;
};

const asText = (value: unknown, fallback = '') => (value === null || value === undefined ? fallback : String(value).trim());
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

const clampRating = (value: unknown) => Math.min(5, Math.max(1, Math.round(asNumber(value, 5))));

const toReviewItem = (row: Record<string, unknown>, orderById: Map<string, Record<string, unknown>>): ReviewItem => {
  const orderId = row.order_id ? String(row.order_id) : null;
  const order = orderId ? orderById.get(orderId) : null;
  return {
    id: String(row.id || ''),
    orderId,
    customerId: row.customer_id ? String(row.customer_id) : null,
    reviewerName: asText(row.reviewer_name, 'Happy Tails Customer'),
    serviceLabel: asText(row.service_label, 'Cafe Order'),
    rating: clampRating(row.rating),
    comment: asText(row.comment),
    isPublic: row.is_public !== false,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at || row.created_at),
    orderCode: asText(order?.code, orderId || '-'),
    orderType: asText(order?.order_type, '-').replaceAll('_', ' '),
    orderStatus: asText(order?.status, '-').replaceAll('_', ' '),
    orderTotal: asNumber(order?.total_amount, 0),
  };
};

export const ReviewsPage = () => {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [query, setQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingReviewId, setSavingReviewId] = useState('');

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const supabase = requireSupabaseClient();
      const { data, error: reviewError } = await supabase
        .from('customer_order_reviews')
        .select('id, order_id, customer_id, reviewer_name, service_label, rating, comment, is_public, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (reviewError) throw reviewError;

      const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      const orderIds = [...new Set(rows.map((row) => asText(row.order_id)).filter(Boolean))];
      let orderById = new Map<string, Record<string, unknown>>();

      if (orderIds.length) {
        const orderResult = await supabase
          .from('orders')
          .select('id, code, order_type, status, total_amount')
          .in('id', orderIds);
        if (!orderResult.error && Array.isArray(orderResult.data)) {
          orderById = new Map(orderResult.data.map((order) => [String(order.id), order as Record<string, unknown>]));
        }
      }

      setReviews(rows.map((row) => toReviewItem(row, orderById)));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load customer reviews. Apply the customer reviews schema if this page is empty.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const services = useMemo(
    () => ['all', ...Array.from(new Set(reviews.map((review) => review.serviceLabel).filter(Boolean))).sort()],
    [reviews],
  );

  const filteredReviews = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesSearch =
        !needle ||
        [review.reviewerName, review.serviceLabel, review.comment, review.orderCode]
          .some((value) => value.toLowerCase().includes(needle));
      const matchesRating = ratingFilter === 'all' || review.rating === Number(ratingFilter);
      const matchesService = serviceFilter === 'all' || review.serviceLabel === serviceFilter;
      return matchesSearch && matchesRating && matchesService;
    });
  }, [query, ratingFilter, reviews, serviceFilter]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const average = total ? reviews.reduce((sum, review) => sum + review.rating, 0) / total : 0;
    return {
      total,
      average: average.toFixed(1),
      publicCount: reviews.filter((review) => review.isPublic).length,
      fiveStarCount: reviews.filter((review) => review.rating === 5).length,
    };
  }, [reviews]);

  const handleTogglePublic = async (review: ReviewItem) => {
    try {
      setSavingReviewId(review.id);
      const supabase = requireSupabaseClient();
      const nextValue = !review.isPublic;
      const { error: updateError } = await supabase
        .from('customer_order_reviews')
        .update({ is_public: nextValue, updated_at: new Date().toISOString() })
        .eq('id', review.id);

      if (updateError) throw updateError;
      setReviews((current) => current.map((item) => (item.id === review.id ? { ...item, isPublic: nextValue } : item)));
      setSelectedReview((current) => (current?.id === review.id ? { ...current, isPublic: nextValue } : current));
      toast.success(nextValue ? 'Review is now public.' : 'Review hidden from homepage.');
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, 'Unable to update review visibility.'));
    } finally {
      setSavingReviewId('');
    }
  };

  if (loading) return <p>Loading reviews...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <SectionCard title="Customer Reviews" subtitle="Owner view for customer feedback, public visibility, and order context.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Average rating</p>
            <p className="text-2xl font-semibold text-[#F23895]">{stats.average}/5</p>
          </div>
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Total reviews</p>
            <p className="text-2xl font-semibold text-[#F23895]">{stats.total}</p>
          </div>
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Public on homepage</p>
            <p className="text-2xl font-semibold text-[#F23895]">{stats.publicCount}</p>
          </div>
          <div className="rounded-lg border bg-[#FFF7F9] p-3">
            <p className="text-xs uppercase text-[#6B7280]">Five-star reviews</p>
            <p className="text-2xl font-semibold text-[#F23895]">{stats.fiveStarCount}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Review Queue" subtitle="Search by customer, order code, service, or review text." contentClassName="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_220px]">
          <label className="text-sm">
            Search
            <input
              className="mt-1 block w-full rounded border px-2 py-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, order, service, comment"
            />
          </label>
          <label className="text-sm">
            Rating
            <select className="mt-1 block w-full rounded border px-2 py-2" value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
              <option value="all">All ratings</option>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>{rating} stars</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Service
            <select className="mt-1 block w-full rounded border px-2 py-2" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
              {services.map((service) => (
                <option key={service} value={service}>{service === 'all' ? 'All services' : service}</option>
              ))}
            </select>
          </label>
        </div>

        {!filteredReviews.length ? (
          <EmptyState title="No reviews found" message="Try clearing the filters or wait for completed-order reviews." />
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="text-left">
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Service</th>
                  <th>Rating</th>
                  <th>Visibility</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map((review) => (
                  <tr key={review.id} className="border-t">
                    <td className="font-medium">{review.reviewerName}</td>
                    <td>{review.orderCode}</td>
                    <td>{review.serviceLabel}</td>
                    <td>{review.rating}/5</td>
                    <td>
                      <StatusChip label={review.isPublic ? 'public' : 'hidden'} tone={review.isPublic ? 'success' : 'neutral'} />
                    </td>
                    <td>{formatDate(review.createdAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedReview(review)}>View Details</Button>
                        <Button variant="secondary" size="sm" disabled={savingReviewId === review.id} onClick={() => handleTogglePublic(review)}>
                          {review.isPublic ? 'Hide' : 'Publish'}
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

      {selectedReview ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-white p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Review details</h3>
              <Button variant="outline" size="sm" onClick={() => setSelectedReview(null)}>Close</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="rounded border p-3">
                <p><strong>Customer:</strong> {selectedReview.reviewerName}</p>
                <p><strong>Rating:</strong> {selectedReview.rating}/5</p>
                <p><strong>Service:</strong> {selectedReview.serviceLabel}</p>
                <p><strong>Visibility:</strong> {selectedReview.isPublic ? 'Public' : 'Hidden'}</p>
              </div>
              <div className="rounded border p-3">
                <p><strong>Order:</strong> {selectedReview.orderCode}</p>
                <p><strong>Type:</strong> {selectedReview.orderType}</p>
                <p><strong>Status:</strong> {selectedReview.orderStatus}</p>
                <p><strong>Total:</strong> {formatCurrency(selectedReview.orderTotal)}</p>
              </div>
            </div>
            <div className="rounded border bg-[#FFF7F9] p-3 text-sm">
              <p className="font-medium">Customer comment</p>
              <p className="mt-1 whitespace-pre-wrap text-[#4B5563]">{selectedReview.comment}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={savingReviewId === selectedReview.id} onClick={() => handleTogglePublic(selectedReview)}>
                {selectedReview.isPublic ? 'Hide from homepage' : 'Publish on homepage'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
