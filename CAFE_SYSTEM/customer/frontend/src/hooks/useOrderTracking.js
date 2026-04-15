import { useCallback, useMemo, useState } from "react";
import { getLatestOrder, getOrderById, getStatusSteps } from "../services/orderService";

export function useOrderTracking() {
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLatest = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const latest = await getLatestOrder();
      setOrder(latest);
      return latest;
    } catch (loadError) {
      setError(loadError?.message || "We couldn't load your latest order right now.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const lookupByOrderId = useCallback(async (orderId) => {
    setIsLoading(true);
    setError("");

    try {
      const found = await getOrderById(orderId.trim());
      if (!found) {
        setOrder(null);
        setError("We couldn't find that order on this account. Check the ID and try again.");
        return null;
      }
      setOrder(found);
      return found;
    } catch (lookupError) {
      setError(lookupError?.message || "We couldn't look up that order right now.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const steps = useMemo(() => getStatusSteps(order?.orderType), [order?.orderType]);
  const currentStepIndex = useMemo(() => {
    if (!order) return -1;
    return steps.findIndex((step) => step.toLowerCase() === order.status?.toLowerCase());
  }, [order, steps]);

  return {
    order,
    isLoading,
    error,
    steps,
    currentStepIndex,
    loadLatest,
    lookupByOrderId
  };
}
