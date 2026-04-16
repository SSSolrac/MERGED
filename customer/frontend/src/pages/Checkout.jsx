import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { createOrder, validateCheckout } from "../services/orderService";
import { getCustomerProfile, saveCustomerProfile } from "../services/profileService";
import { syncCustomerNotifications } from "../services/notificationService";
import { DEFAULT_PUBLIC_BUSINESS_SETTINGS, getPublicBusinessSettings } from "../services/businessSettingsService";
import { labelToCanonicalOrderType } from "../constants/canonical";
import { PAYMENT_METHOD_OPTIONS, getPaymentQrAsset, paymentMethodToLabel } from "../utils/paymentMethods";
import { getActiveDeliveryConfig, validateDeliveryAddressOnServer } from "../services/deliveryAreaService";
import {
  parseDeliveryAddress,
  validateDeliveryAddress,
} from "../utils/deliveryAddress";
import DeliveryAddressForm from "../components/DeliveryAddressForm";
import "./Checkout.css";

const defaultForm = {
  name: "",
  phone: "",
  address: "",
  orderType: "Dine-in",
  paymentMethod: "qrph",
  notes: "",
};

const defaultDeliveryInput = {
  houseDetails: "",
  selectedPurokId: "",
  latitude: null,
  longitude: null,
};

const ORDER_TYPE_OPTIONS = [
  { value: "Dine-in", enabledKey: "enableDineIn" },
  { value: "Pickup", enabledKey: "enablePickup" },
  { value: "Takeout", enabledKey: "enableTakeout" },
  { value: "Delivery", enabledKey: "enableDelivery" },
];

function isPaymentMethodEnabled(settings, method) {
  const safeSettings = settings && typeof settings === "object" ? settings : DEFAULT_PUBLIC_BUSINESS_SETTINGS;
  switch (String(method || "").trim().toLowerCase()) {
    case "qrph":
      return safeSettings.enableQrph !== false;
    case "gcash":
      return safeSettings.enableGcash !== false;
    case "maribank":
      return safeSettings.enableMariBank !== false;
    case "bdo":
      return safeSettings.enableBdo !== false;
    case "cash":
      return safeSettings.enableCash !== false;
    default:
      return false;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the receipt file."));
    reader.readAsDataURL(file);
  });
}

function toPhilippineLocalDigits(value) {
  let digitsOnly = String(value || "").replace(/\D/g, "");
  if (!digitsOnly) return "";

  if (digitsOnly.startsWith("63")) digitsOnly = digitsOnly.slice(2);
  if (digitsOnly.startsWith("0")) digitsOnly = digitsOnly.slice(1);

  return digitsOnly.slice(0, 10);
}

function toPhilippineE164(value) {
  const localDigits = toPhilippineLocalDigits(value);
  if (!localDigits) return "";
  return `+63${localDigits}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const { cart, total, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [deliveryInput, setDeliveryInput] = useState(defaultDeliveryInput);
  const [deliveryConfig, setDeliveryConfig] = useState(null);
  const [isLoadingDeliveryConfig, setIsLoadingDeliveryConfig] = useState(true);
  const [checkoutSettings, setCheckoutSettings] = useState(DEFAULT_PUBLIC_BUSINESS_SETTINGS);
  const [isLoadingCheckoutSettings, setIsLoadingCheckoutSettings] = useState(true);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const savedAddressFromProfileRef = useRef("");
  const appliedProfileAddressRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const loadCheckoutSettings = async () => {
      try {
        setIsLoadingCheckoutSettings(true);
        const settings = await getPublicBusinessSettings();
        if (isCancelled) return;
        setCheckoutSettings(settings);
      } catch {
        if (isCancelled) return;
        setCheckoutSettings(DEFAULT_PUBLIC_BUSINESS_SETTINGS);
      } finally {
        if (!isCancelled) setIsLoadingCheckoutSettings(false);
      }
    };

    loadCheckoutSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadDeliveryConfig = async () => {
      try {
        setIsLoadingDeliveryConfig(true);
        const config = await getActiveDeliveryConfig({ force: true });
        if (isCancelled) return;
        setDeliveryConfig(config);
      } catch {
        if (isCancelled) return;
        setDeliveryConfig(null);
      } finally {
        if (!isCancelled) setIsLoadingDeliveryConfig(false);
      }
    };

    loadDeliveryConfig();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (!isAuthenticated) return;
      const fallbackName = String(user?.name || "").trim();

      try {
        const profile = await getCustomerProfile();
        const savedAddress = Array.isArray(profile?.addresses) ? String(profile.addresses[0] || "") : "";
        savedAddressFromProfileRef.current = savedAddress;

        setForm((prev) => ({
          ...prev,
          name: String(profile?.name || fallbackName || prev.name || "").trim(),
          phone: toPhilippineLocalDigits(profile?.phone || "") || prev.phone,
          address: savedAddress || prev.address,
        }));
      } catch {
        if (fallbackName) {
          setForm((prev) => (String(prev.name || "").trim() ? prev : { ...prev, name: fallbackName }));
        }
      }
    };

    loadProfile();
  }, [isAuthenticated, user?.name]);

  useEffect(() => {
    if (appliedProfileAddressRef.current) return;
    if (!deliveryConfig) return;

    const parsed = parseDeliveryAddress(savedAddressFromProfileRef.current, deliveryConfig);
    if (!parsed.houseDetails && !parsed.selectedPurokId) return;

    setDeliveryInput((prev) => ({
      ...prev,
      houseDetails: parsed.houseDetails || prev.houseDetails,
      selectedPurokId: parsed.selectedPurokId || prev.selectedPurokId,
    }));
    appliedProfileAddressRef.current = true;
  }, [deliveryConfig]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  const availableOrderTypeOptions = useMemo(
    () => ORDER_TYPE_OPTIONS.filter((option) => checkoutSettings?.[option.enabledKey] !== false),
    [checkoutSettings]
  );

  const availablePaymentOptions = useMemo(
    () => PAYMENT_METHOD_OPTIONS.filter((method) => isPaymentMethodEnabled(checkoutSettings, method.value)),
    [checkoutSettings]
  );

  useEffect(() => {
    if (!availableOrderTypeOptions.length) return;
    setForm((prev) =>
      availableOrderTypeOptions.some((option) => option.value === prev.orderType)
        ? prev
        : { ...prev, orderType: availableOrderTypeOptions[0].value }
    );
  }, [availableOrderTypeOptions]);

  useEffect(() => {
    if (!availablePaymentOptions.length) return;
    setForm((prev) =>
      availablePaymentOptions.some((option) => option.value === prev.paymentMethod)
        ? prev
        : { ...prev, paymentMethod: availablePaymentOptions[0].value }
    );
  }, [availablePaymentOptions]);

  useEffect(() => {
    if (form.paymentMethod !== "cash") return;

    setErrors((prev) => (prev.receipt ? { ...prev, receipt: "" } : prev));

    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    if (receiptFile || receiptPreviewUrl) {
      setReceiptFile(null);
      setReceiptPreviewUrl("");
    }
  }, [form.paymentMethod, receiptFile, receiptPreviewUrl]);

  const normalizedPhone = toPhilippineE164(form.phone);
  const canonicalOrderType = labelToCanonicalOrderType(form.orderType);
  const requiresDeliveryAddress = canonicalOrderType === "delivery";
  const isCashPayment = form.paymentMethod === "cash";
  const hasName = Boolean(form.name.trim());
  const isPhoneValid = /^9\d{9}$/.test(form.phone);
  const hasReceipt = isCashPayment || Boolean(receiptFile);
  const hasAvailableOrderTypes = availableOrderTypeOptions.length > 0;
  const hasAvailablePaymentMethods = availablePaymentOptions.length > 0;
  const isSelectedOrderTypeEnabled = availableOrderTypeOptions.some((option) => option.value === form.orderType);
  const isSelectedPaymentEnabled = availablePaymentOptions.some((option) => option.value === form.paymentMethod);

  const deliveryValidation = useMemo(() => {
    if (!deliveryConfig) {
      return {
        isValid: false,
        errors: { address: "Delivery configuration is currently unavailable." },
        normalizedAddress: "",
        selectedPurok: null,
        latitude: NaN,
        longitude: NaN,
      };
    }

    return validateDeliveryAddress({
      houseDetails: deliveryInput.houseDetails,
      selectedPurokId: deliveryInput.selectedPurokId,
      latitude: deliveryInput.latitude,
      longitude: deliveryInput.longitude,
      config: deliveryConfig,
    });
  }, [deliveryConfig, deliveryInput.houseDetails, deliveryInput.latitude, deliveryInput.longitude, deliveryInput.selectedPurokId]);

  const hasAddress = !requiresDeliveryAddress || (!isLoadingDeliveryConfig && deliveryValidation.isValid);
  const canSubmit =
    hasName &&
    isPhoneValid &&
    hasAddress &&
    hasReceipt &&
    !isLoadingCheckoutSettings &&
    hasAvailableOrderTypes &&
    hasAvailablePaymentMethods &&
    isSelectedOrderTypeEnabled &&
    isSelectedPaymentEnabled;

  const payload = useMemo(
    () => ({
      customerId: user?.id || "guest",
      customer: {
        name: form.name,
        phone: normalizedPhone,
        address: form.address,
        email: user?.email || "",
      },
      orderType: canonicalOrderType,
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      items: cart,
      total,
    }),
    [canonicalOrderType, cart, form, normalizedPhone, total, user?.email, user?.id]
  );

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({
      ...prev,
      [key]: "",
      ...(key === "orderType"
        ? { address: "", houseDetails: "", purok: "", mapPin: "" }
        : {}),
    }));
  };

  const handlePhoneChange = (value) => {
    setForm((prev) => ({ ...prev, phone: toPhilippineLocalDigits(value) }));
    setErrors((prev) => ({ ...prev, phone: "" }));
  };

  const handleDeliveryInputChange = (nextValue) => {
    setDeliveryInput((prev) => ({ ...prev, ...nextValue }));
    setErrors((prev) => ({ ...prev, address: "", houseDetails: "", purok: "", mapPin: "" }));
  };

  const handleReceiptChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setErrors((prev) => ({ ...prev, receipt: "Upload a PNG, JPG, or WebP image." }));
      event.target.value = "";
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrors((prev) => ({ ...prev, receipt: "Receipt must be 5MB or smaller." }));
      event.target.value = "";
      return;
    }

    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
    setErrors((prev) => ({ ...prev, receipt: "" }));
  };

  const removeReceipt = () => {
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl("");
    setReceiptFile(null);
    setErrors((prev) => ({ ...prev, receipt: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      if (isLoadingCheckoutSettings) {
        setErrors((prev) => ({ ...prev, form: "Checkout settings are still loading. Please try again." }));
        return;
      }

      if (!hasAvailableOrderTypes || !isSelectedOrderTypeEnabled) {
        setErrors((prev) => ({ ...prev, form: "No order type is currently available for checkout." }));
        return;
      }

      if (!hasAvailablePaymentMethods || !isSelectedPaymentEnabled) {
        setErrors((prev) => ({ ...prev, form: "No payment method is currently available for checkout." }));
        return;
      }

      let normalizedAddress = "";
      let deliveryMeta = null;

      if (requiresDeliveryAddress) {
        if (isLoadingDeliveryConfig || !deliveryConfig) {
          setErrors((prev) => ({ ...prev, address: "Delivery configuration is still loading. Please try again." }));
          return;
        }

        if (!deliveryValidation.isValid) {
          const nextAddressError =
            deliveryValidation.errors.address ||
            deliveryValidation.errors.mapPin ||
            deliveryValidation.errors.purok ||
            deliveryValidation.errors.houseDetails ||
            "Please complete your delivery details.";
          setErrors((prev) => ({
            ...prev,
            ...deliveryValidation.errors,
            address: nextAddressError,
          }));
          return;
        }

        const serverValidation = await validateDeliveryAddressOnServer({
          deliveryAreaId: deliveryConfig.id,
          selectedPurokId: deliveryValidation.selectedPurok?.id || deliveryInput.selectedPurokId,
          houseDetails: deliveryInput.houseDetails,
          latitude: deliveryValidation.latitude,
          longitude: deliveryValidation.longitude,
        });

        normalizedAddress = String(serverValidation.normalizedAddress || "").trim();
        if (!normalizedAddress) {
          setErrors((prev) => ({ ...prev, address: "Unable to build delivery address. Please check your details." }));
          return;
        }

        deliveryMeta = {
          deliveryAreaId: serverValidation.deliveryAreaId || deliveryConfig.id,
          selectedPurokId: serverValidation.selectedPurokId || deliveryValidation.selectedPurok?.id || "",
          selectedPurokName: serverValidation.selectedPurokName || deliveryValidation.selectedPurok?.purokName || "",
          fixedBarangayName: serverValidation.fixedBarangayName || deliveryConfig.fixedBarangayName || "",
          city: serverValidation.city || deliveryConfig.city || "",
          province: serverValidation.province || deliveryConfig.province || "",
          country: serverValidation.country || deliveryConfig.country || "",
          houseDetails: deliveryInput.houseDetails.trim(),
          latitude:
            Number.isFinite(serverValidation.latitude) ? serverValidation.latitude : deliveryValidation.latitude,
          longitude:
            Number.isFinite(serverValidation.longitude) ? serverValidation.longitude : deliveryValidation.longitude,
          address: normalizedAddress,
        };

        setForm((prev) => ({ ...prev, address: normalizedAddress }));
        setErrors((prev) => ({ ...prev, address: "", houseDetails: "", purok: "", mapPin: "" }));
      } else {
        normalizedAddress = "";
        setErrors((prev) => ({ ...prev, address: "", houseDetails: "", purok: "", mapPin: "" }));
      }

      if (!isCashPayment && !receiptFile) {
        setErrors((prev) => ({ ...prev, receipt: "Receipt upload is required." }));
        return;
      }

      let receiptDataUrl = "";
      if (!isCashPayment && receiptFile) {
        try {
          receiptDataUrl = await fileToDataUrl(receiptFile);
        } catch (error) {
          setErrors((prev) => ({ ...prev, receipt: error.message || "Could not read the receipt file." }));
          return;
        }
      }

      const payloadWithReceipt = {
        ...payload,
        customer: {
          ...payload.customer,
          address: normalizedAddress,
        },
        deliveryMeta,
        receiptImageUrl: isCashPayment ? null : receiptDataUrl,
      };

      const validation = await validateCheckout(payloadWithReceipt);
      if (!validation.isValid) {
        setErrors(validation.errors);
        return;
      }

      const profileUpdate = {
        name: form.name.trim(),
        phone: normalizedPhone,
      };

      if (requiresDeliveryAddress && normalizedAddress) {
        profileUpdate.addresses = [normalizedAddress];
      }

      await saveCustomerProfile(profileUpdate);
      await createOrder(payloadWithReceipt);
      await syncCustomerNotifications();
      clearCart();
      removeReceipt();
      navigate("/order-success");
    } catch (error) {
      setErrors({ form: error.message || "Could not place your order." });
      if (error?.kind === "missing_rpc" || error?.kind === "missing_relation") {
        setErrors({
          form: "Our order system isn't fully deployed. Please apply unified_schema.sql and delivery_area_schema.sql on Supabase.",
        });
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="checkout-state">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link to="/order">Go to Order</Link>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="checkout-state">
        <h1>Checkout</h1>
        <p>Please sign in to place an order.</p>
        <Link to="/">Go back</Link>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-header">
        <h1>Checkout</h1>
        <Link to="/order">Back to Menu</Link>
      </div>
      <p className="profile-session">
        Ordering as <strong>{user?.email || form.name || "Authenticated user"}</strong>
      </p>

      <form className="checkout-layout" onSubmit={submit}>
        <section className="checkout-card checkout-card--details">
          <h3>Customer Details</h3>

          <label>Name</label>
          <input value={form.name} onChange={(event) => handleFieldChange("name", event.target.value)} />
          {errors.name ? <p className="field-error">{errors.name}</p> : null}

          <label>
            Phone <span className="required-indicator">*</span>
          </label>
          <div className="phone-input-wrap">
            <span className="phone-prefix">+63</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9XXXXXXXXX or 09XXXXXXXXX"
              maxLength={11}
              value={form.phone}
              onChange={(event) => handlePhoneChange(event.target.value)}
            />
          </div>
          <p className="field-hint">You can type either `9XXXXXXXXX` or `09XXXXXXXXX`.</p>
          {errors.phone ? <p className="field-error">{errors.phone}</p> : null}

          <label>Order Type</label>
          <select
            value={form.orderType}
            onChange={(event) => handleFieldChange("orderType", event.target.value)}
            disabled={isLoadingCheckoutSettings || !hasAvailableOrderTypes}
          >
            {availableOrderTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </select>
          <p className="field-hint">Available order types are pulled from owner-managed business settings.</p>
          {!hasAvailableOrderTypes && !isLoadingCheckoutSettings ? (
            <p className="field-error">No order type is currently enabled for checkout.</p>
          ) : null}

          {requiresDeliveryAddress ? (
            <>
              <label>
                Delivery Address <span className="required-indicator">*</span>
              </label>
              {isLoadingDeliveryConfig ? (
                <p className="field-hint">Loading delivery coverage...</p>
              ) : (
                <DeliveryAddressForm
                  config={deliveryConfig}
                  value={deliveryInput}
                  onChange={handleDeliveryInputChange}
                  validationErrors={errors}
                />
              )}
              <p className="field-hint">
                Only pins inside the configured service polygon can be submitted.
              </p>
              {errors.address ? <p className="field-error">{errors.address}</p> : null}
            </>
          ) : (
            <>
              <label>Address</label>
              <div className="checkout-address-optional" aria-live="polite">
                <p className="field-hint">
                  Address is not required for {form.orderType} orders. Select Delivery for map-validated doorstep delivery.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="checkout-card checkout-card--payment">
          <h3>Payment Details</h3>
          <label>Payment</label>
          <select
            value={form.paymentMethod}
            onChange={(event) => handleFieldChange("paymentMethod", event.target.value)}
            disabled={isLoadingCheckoutSettings || !hasAvailablePaymentMethods}
          >
            {availablePaymentOptions.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          <p className="field-hint">Enabled payment methods are controlled from owner business settings.</p>
          {errors.paymentMethod ? <p className="field-error">{errors.paymentMethod}</p> : null}
          {!hasAvailablePaymentMethods && !isLoadingCheckoutSettings ? (
            <p className="field-error">No payment method is currently enabled for checkout.</p>
          ) : null}

          <div className="payment-qr-preview" aria-live="polite">
            {!hasAvailablePaymentMethods ? (
              <>
                <p className="payment-qr-title">No payment method available</p>
                <p className="field-hint">Ask the cafe to enable at least one payment method in owner settings.</p>
              </>
            ) : getPaymentQrAsset(form.paymentMethod) ? (
              <>
                <p className="payment-qr-title">Scan to pay via {paymentMethodToLabel(form.paymentMethod)}</p>
                <img src={getPaymentQrAsset(form.paymentMethod)} alt={`${paymentMethodToLabel(form.paymentMethod)} QR code`} />
              </>
            ) : (
              <>
                <p className="payment-qr-title">Cash payment selected</p>
                <p className="field-hint">You can pay in cash upon pickup or delivery.</p>
              </>
            )}
          </div>

          <label>
            Upload Receipt {isCashPayment ? null : <span className="required-indicator">*</span>}
          </label>
          {isCashPayment ? (
            <p className="field-hint">Receipt upload is not required for cash payments in-store.</p>
          ) : (
            <>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleReceiptChange} />
              <p className="field-hint">Upload a screenshot/photo of your payment receipt (PNG/JPG/WebP, max 5MB).</p>
              {receiptFile ? (
                <div className="receipt-preview" aria-live="polite">
                  <img src={receiptPreviewUrl} alt="Receipt preview" />
                  <div className="receipt-meta">
                    <span className="receipt-file-name">{receiptFile.name}</span>
                    <button type="button" className="receipt-remove" onClick={removeReceipt}>
                      Remove receipt
                    </button>
                  </div>
                </div>
              ) : null}
              {errors.receipt ? <p className="field-error">{errors.receipt}</p> : null}
            </>
          )}

          <label>Notes (optional)</label>
          <textarea value={form.notes} onChange={(event) => handleFieldChange("notes", event.target.value)} />

          {errors.form ? <p className="field-error">{errors.form}</p> : null}
          {errors.items ? <p className="field-error">{errors.items}</p> : null}
        </section>

        <aside className="checkout-card checkout-card--summary">
          <h3>Order Summary</h3>
          <div className="checkout-summary-list">
            {cart.map((item) => (
              <div className="summary-row" key={item.id}>
                <span>{item.displayName || item.name} x {item.qty}</span>
                <span>PHP {(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="checkout-summary-footer">
            <hr />
            <div className="summary-row total-row">
              <span>Total</span>
              <span>PHP {Number(total || 0).toFixed(2)}</span>
            </div>
          </div>
          <button className="checkout-submit" type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? "Placing order..." : "Place Order"}
          </button>
        </aside>
      </form>
    </div>
  );
}
