import bdoQr from '@/assets/payments/BDO.svg';
import gcashQr from '@/assets/payments/GCASH.svg';
import maribankQr from '@/assets/payments/MARIBANK.svg';
import qrphQr from '@/assets/payments/QRPH.svg';
import type { PaymentMethod } from '@/types/order';

type PaymentMethodKey = Exclude<PaymentMethod, null>;

export const CANONICAL_PAYMENT_METHODS: PaymentMethodKey[] = ['qrph', 'gcash', 'maribank', 'bdo', 'cash'];

const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  qrph: 'QRPH',
  gcash: 'GCash',
  maribank: 'MariBank',
  bdo: 'BDO',
  cash: 'Cash',
};

export const PAYMENT_METHOD_OPTIONS = CANONICAL_PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

const PAYMENT_METHOD_QR_ASSETS: Partial<Record<PaymentMethodKey, string>> = {
  qrph: qrphQr,
  gcash: gcashQr,
  maribank: maribankQr,
  bdo: bdoQr,
};

const METHOD_ALIASES: Record<string, PaymentMethodKey> = {
  qrph: 'qrph',
  qr_ph: 'qrph',
  'qr ph': 'qrph',
  gcash: 'gcash',
  maribank: 'maribank',
  'mari bank': 'maribank',
  'mari-bank': 'maribank',
  bdo: 'bdo',
  e_wallet: 'gcash',
  ewallet: 'gcash',
  maya: 'gcash',
  card: 'bdo',
  cash: 'cash',
};

export const normalizePaymentMethod = (method: string | undefined | null): PaymentMethod => {
  if (!method) return null;
  const normalized = method.toLowerCase().replaceAll('-', '_').trim();
  return METHOD_ALIASES[normalized] ?? null;
};

export const paymentMethodToLabel = (method: PaymentMethod) => {
  if (!method) return '-';
  const canonical = normalizePaymentMethod(method);
  return canonical ? PAYMENT_METHOD_LABELS[canonical] : '-';
};

export const labelToPaymentMethod = (label: string): PaymentMethod => normalizePaymentMethod(label);

export const getPaymentQrAsset = (method: PaymentMethod) => {
  const canonical = normalizePaymentMethod(method);
  return canonical ? PAYMENT_METHOD_QR_ASSETS[canonical] ?? null : null;
};
