import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { createOrder, validateCheckout } from "../services/orderService";
import { getCustomerProfile, saveCustomerProfile } from "../services/profileService";
import { syncCustomerNotifications } from "../services/notificationService";
import { labelToCanonicalOrderType } from "../constants/canonical";
import { PAYMENT_METHOD_OPTIONS, getPaymentQrAsset, paymentMethodToLabel } from "../utils/paymentMethods";
import {
  composeLucenaAddress,
  findLucenaBarangay,
  findLucenaPurok,
  getPuroksForBarangay,
  LUCENA_CITY_LABEL,
  LUCENA_PROVINCE_LABEL,
  parseLucenaAddress,
} from "../utils/lucenaAddress";
import "./Checkout.css";

const defaultForm = {
  name: "",
  phone: "",
  address: "",
  orderType: "Dine-in",
  paymentMethod: "qrph",
  notes: ""
};

const DELIVERY_BARANGAY = "Ilayang Iyam";
const DELIVERY_AREA_ERROR_MESSAGE = "Sorry, we currently only deliver within Barangay Ilayang Iyam, Lucena City, Quezon.";
const ADDRESS_REQUIRED_MESSAGE = "Please complete your full address (House/Unit/Street + Purok) for Barangay Ilayang Iyam.";
const defaultAddressFields = {
  houseDetails: "",
  purok: "",
  barangay: DELIVERY_BARANGAY,
};

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
  const [addressFields, setAddressFields] = useState(defaultAddressFields);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      if (!isAuthenticated) return;
      const fallbackName = String(user?.name || "").trim();

      try {
        const profile = await getCustomerProfile();
        const savedAddress = Array.isArray(profile?.addresses) ? String(profile.addresses[0] || "") : "";
        const parsedAddress = parseLucenaAddress(savedAddress);

        setForm((prev) => ({
          ...prev,
          name: String(profile?.name || fallbackName || prev.name || "").trim(),
          phone: toPhilippineLocalDigits(profile?.phone || "") || prev.phone,
          address: savedAddress || prev.address,
        }));
        setAddressFields({
          houseDetails: parsedAddress.houseDetails || "",
          purok: parsedAddress.purok || "",
          barangay: parsedAddress.barangay || DELIVERY_BARANGAY,
        });
      } catch {
        if (fallbackName) {
          setForm((prev) => (String(prev.name || "").trim() ? prev : { ...prev, name: fallbackName }));
        }
      }
    };

    loadProfile();
  }, [isAuthenticated, user?.name]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

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
  const isCashPayment = form.paymentMethod === "cash";
  const hasName = Boolean(form.name.trim());
  const isPhoneValid = /^9\d{9}$/.test(form.phone);
  const hasAddress =
    Boolean(addressFields.houseDetails.trim()) &&
    Boolean(findLucenaBarangay(addressFields.barangay)) &&
    Boolean(findLucenaPurok(addressFields.barangay, addressFields.purok));
  const hasReceipt = isCashPayment || Boolean(receiptFile);
  const canSubmit = hasName && isPhoneValid && hasAddress && hasReceipt;

  const payload = useMemo(
    () => ({
      customerId: user?.id || "guest",
      customer: {
        name: form.name,
        phone: normalizedPhone,
        address: form.address,
        email: user?.email || ""
      },
      orderType: labelToCanonicalOrderType(form.orderType),
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      items: cart,
      total
    }),
    [cart, form, normalizedPhone, total, user?.email, user?.id]
  );

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const handlePhoneChange = (value) => {
    setForm((prev) => ({ ...prev, phone: toPhilippineLocalDigits(value) }));
    setErrors((prev) => ({ ...prev, phone: "" }));
  };

  const handleHouseDetailsChange = (value) => {
    const nextHouseDetails = String(value || "");
    const composedAddress = composeLucenaAddress({
      houseDetails: nextHouseDetails,
      purok: addressFields.purok,
      barangay: addressFields.barangay,
    });

    setAddressFields((prev) => ({ ...prev, houseDetails: nextHouseDetails }));
    setForm((prev) => ({ ...prev, address: composedAddress }));
    setErrors((prev) => ({ ...prev, address: "" }));
  };

  const handleBarangayChange = (value) => {
    const canonicalBarangay = findLucenaBarangay(value);
    const availablePuroks = getPuroksForBarangay(canonicalBarangay);
    const canonicalPurok = findLucenaPurok(canonicalBarangay, addressFields.purok);
    const nextPurok = availablePuroks.includes(canonicalPurok) ? canonicalPurok : "";
    const composedAddress = composeLucenaAddress({
      houseDetails: addressFields.houseDetails,
      purok: nextPurok,
      barangay: canonicalBarangay,
    });

    setAddressFields((prev) => ({ ...prev, barangay: canonicalBarangay, purok: nextPurok }));
    setForm((prev) => ({ ...prev, address: composedAddress }));
    setErrors((prev) => ({ ...prev, address: "" }));
  };

  const handlePurokChange = (value) => {
    const canonicalPurok = findLucenaPurok(addressFields.barangay, value);
    const composedAddress = composeLucenaAddress({
      houseDetails: addressFields.houseDetails,
      purok: canonicalPurok,
      barangay: addressFields.barangay,
    });

    setAddressFields((prev) => ({ ...prev, purok: canonicalPurok }));
    setForm((prev) => ({ ...prev, address: composedAddress }));
    setErrors((prev) => ({ ...prev, address: "" }));
  };

  const ensureLucenaAddress = () => {
    const houseDetails = String(addressFields.houseDetails || "").trim();
    const canonicalBarangay = findLucenaBarangay(addressFields.barangay || DELIVERY_BARANGAY);
    const canonicalPurok = findLucenaPurok(canonicalBarangay, addressFields.purok);

    if (!houseDetails) {
      setErrors((prev) => ({ ...prev, address: ADDRESS_REQUIRED_MESSAGE }));
      return "";
    }

    if (canonicalBarangay !== DELIVERY_BARANGAY) {
      setAddressFields((prev) => ({ ...prev, barangay: DELIVERY_BARANGAY, purok: "" }));
      setForm((prev) => ({ ...prev, address: "" }));
      setErrors((prev) => ({ ...prev, address: DELIVERY_AREA_ERROR_MESSAGE }));
      return "";
    }

    if (!canonicalPurok) {
      setErrors((prev) => ({ ...prev, address: ADDRESS_REQUIRED_MESSAGE }));
      return "";
    }

    const composedAddress = composeLucenaAddress({
      houseDetails,
      purok: canonicalPurok,
      barangay: canonicalBarangay,
    });

    setAddressFields({
      houseDetails,
      purok: canonicalPurok,
      barangay: DELIVERY_BARANGAY,
    });
    setForm((prev) => ({ ...prev, address: composedAddress }));
    setErrors((prev) => ({ ...prev, address: "" }));
    return composedAddress;
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
      const normalizedAddress = ensureLucenaAddress();
      if (!normalizedAddress) return;

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

      profileUpdate.addresses = [normalizedAddress];

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
          form: "Our order system isn't fully deployed. Please try again after the Supabase schema (unified_schema.sql) is applied on the backend.",
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

      <div className="checkout-layout">
        <form className="checkout-card" onSubmit={submit}>
          <h3>Customer Details</h3>

          <label>Name</label>
          <input value={form.name} onChange={(e) => handleFieldChange("name", e.target.value)} />
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
              onChange={(e) => handlePhoneChange(e.target.value)}
            />
          </div>
          <p className="field-hint">You can type either `9XXXXXXXXX` or `09XXXXXXXXX`.</p>
          {errors.phone ? <p className="field-error">{errors.phone}</p> : null}

          <label>Order Type</label>
          <select value={form.orderType} onChange={(e) => handleFieldChange("orderType", e.target.value)}>
            <option value="Dine-in">Dine-in</option>
            <option value="Pickup">Pickup</option>
            <option value="Takeout">Takeout</option>
            <option value="Delivery">Delivery</option>
          </select>

          <label>
            Address <span className="required-indicator">*</span>
          </label>
          <div className="lucena-address-grid">
            <input
              value={addressFields.houseDetails}
              onChange={(e) => handleHouseDetailsChange(e.target.value)}
              placeholder="House/Unit, Street"
              autoComplete="address-line1"
            />
            <select value={DELIVERY_BARANGAY} onChange={(e) => handleBarangayChange(e.target.value)} disabled>
              <option value={DELIVERY_BARANGAY}>{DELIVERY_BARANGAY}</option>
            </select>
            {addressFields.barangay ? (
              <select value={addressFields.purok} onChange={(e) => handlePurokChange(e.target.value)}>
                <option value="">Select Purok (Ilayang Iyam)</option>
                {getPuroksForBarangay(addressFields.barangay).map((purok) => (
                  <option key={purok} value={purok}>
                    {purok}
                  </option>
                ))}
              </select>
            ) : null}
            <input className="fixed-address-field" value={LUCENA_CITY_LABEL} readOnly aria-label="City" />
            <input className="fixed-address-field" value={LUCENA_PROVINCE_LABEL} readOnly aria-label="Province" />
          </div>
          <p className="field-hint">Delivery is only available in Barangay Ilayang Iyam, Lucena City, Quezon.</p>
          {errors.address ? <p className="field-error">{errors.address}</p> : null}

          <label>Payment</label>
          <select value={form.paymentMethod} onChange={(e) => handleFieldChange("paymentMethod", e.target.value)}>
            {PAYMENT_METHOD_OPTIONS.map((method) => (
              <option key={method.value} value={method.value}>{method.label}</option>
            ))}
          </select>
          {errors.paymentMethod ? <p className="field-error">{errors.paymentMethod}</p> : null}

          <div className="payment-qr-preview" aria-live="polite">
            {getPaymentQrAsset(form.paymentMethod) ? (
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
          <textarea value={form.notes} onChange={(e) => handleFieldChange("notes", e.target.value)} />

          {errors.form ? <p className="field-error">{errors.form}</p> : null}
          {errors.items ? <p className="field-error">{errors.items}</p> : null}

          <button className="checkout-submit" type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? "Placing order..." : "Place Order"}
          </button>
        </form>

        <div className="checkout-card">
          <h3>Order Summary</h3>
          {cart.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>{item.displayName || item.name} × {item.qty}</span>
              <span>₱{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}</span>
            </div>
          ))}
          <hr />
          <div className="summary-row total-row">
            <span>Total</span>
            <span>₱{Number(total || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
