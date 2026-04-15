export const StatusChip = ({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) => {
  const toneMap = {
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-[#FFE4E8] text-slate-700',
  };

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${toneMap[tone]}`}>{label}</span>;
};
