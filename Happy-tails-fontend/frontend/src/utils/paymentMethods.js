import qrphQr from "../assets/QRPH.webp";
import gcashQr from "../assets/GCASH.webp";
import maribankQr from "../assets/MARIBANK.webp";
import bdoQr from "../assets/BDO.webp";
import { CANONICAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, labelToCanonicalPaymentMethod } from "../constants/canonical";

export const PAYMENT_METHOD_OPTIONS = CANONICAL_PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value]
}));

const PAYMENT_QR_ASSETS = {
  qrph: qrphQr,
  gcash: gcashQr,
  maribank: maribankQr,
  bdo: bdoQr,
};

export function paymentMethodToLabel(method) {
  const canonicalMethod = labelToCanonicalPaymentMethod(method);
  return PAYMENT_METHOD_LABELS[canonicalMethod] || PAYMENT_METHOD_LABELS.qrph;
}

export function getPaymentQrAsset(method) {
  const canonicalMethod = labelToCanonicalPaymentMethod(method);
  return PAYMENT_QR_ASSETS[canonicalMethod] || null;
}
