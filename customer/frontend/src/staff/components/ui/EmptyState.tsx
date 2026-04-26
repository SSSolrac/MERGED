import { type ReactNode } from 'react';

export const EmptyState = ({
  title,
  message,
  action,
  className = '',
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={`rounded-lg border border-dashed border-[#F3D6DB] bg-[#FFF7F9] p-4 text-sm ${className}`}>
    <p className="font-medium text-[#1F2937]">{title}</p>
    {message ? <p className="mt-1 text-[#6B7280]">{message}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);
