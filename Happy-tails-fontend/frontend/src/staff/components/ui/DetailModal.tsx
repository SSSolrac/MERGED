import { type ReactNode } from 'react';
import { Button } from './Button';

export const DetailModal = ({
  title,
  children,
  footer,
  onClose,
  maxWidth = 'max-w-4xl',
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close detail dialog overlay" />
    <div className={`relative w-full ${maxWidth} rounded-lg border bg-white p-4 shadow-xl`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Button variant="outline" size="sm" onClick={onClose} aria-label="Close detail dialog">
          Close
        </Button>
      </div>
      <div className="max-h-[72vh] overflow-auto">{children}</div>
      {footer ? <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">{footer}</div> : null}
    </div>
  </div>
);
