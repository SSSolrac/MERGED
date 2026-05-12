import { getPaymentQrAsset, paymentMethodToLabel } from '@/utils/payment';
import type { PaymentMethod } from '@/types/order';

type PaymentQrPreviewProps = {
  paymentMethod: PaymentMethod;
  className?: string;
};

export const PaymentQrPreview = ({ paymentMethod, className }: PaymentQrPreviewProps) => (
  <div className={className}>
    <p className="font-medium text-sm mb-2">{paymentMethod ? `${paymentMethodToLabel(paymentMethod)} QR` : 'Payment method not set'}</p>
    {paymentMethod && getPaymentQrAsset(paymentMethod) ? (
      <img
        src={getPaymentQrAsset(paymentMethod) ?? undefined}
        alt={`${paymentMethodToLabel(paymentMethod)} payment QR`}
        className="h-44 w-44 rounded border object-contain bg-white p-2"
      />
    ) : (
      <div className="h-44 w-44 rounded border bg-white p-3 text-sm text-[#6B7280] flex items-center justify-center text-center">
        QR not available for this payment method.
      </div>
    )}
  </div>
);
