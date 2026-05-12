import type { DateRangePreset } from '@/types/dashboard';

const options: DateRangePreset[] = ['today', '7d', '30d', '90d', '3m', '6m', '1y', 'all'];

const labelForPreset = (preset: DateRangePreset) => {
  const map: Record<DateRangePreset, string> = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    '3m': 'Last 3 months',
    '6m': 'Last 6 months',
    '1y': 'Last 1 year',
    all: 'All time',
  };
  return map[preset];
};

export const DateRangeFilter = ({
  value,
  onChange,
  variant = 'chips',
}: {
  value: DateRangePreset;
  onChange: (value: DateRangePreset) => void;
  variant?: 'chips' | 'select';
}) => {
  if (variant === 'select') {
    return (
      <label className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
        <span className="text-slate-500">Date</span>
        <select className="bg-transparent outline-none" value={value} onChange={(e) => onChange(e.target.value as DateRangePreset)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {labelForPreset(option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-800 p-2 inline-flex gap-2 flex-wrap">
      {options.map((option) => (
        <button
          key={option}
          className={`px-3 py-1.5 rounded text-sm ${
            value === option ? 'bg-[#FF8FA3] text-white' : 'bg-[#FFE4E8] text-[#1F2937] hover:bg-[#FFD1DA]'
          }`}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
};
