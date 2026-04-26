import { Button } from './Button';

export const PaginationControls = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'records',
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-sm text-[#6B7280]">
        Showing {from}-{to} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          Previous
        </Button>
        <span className="text-sm text-slate-700">
          Page {safePage} of {safeTotalPages}
        </span>
        <Button variant="outline" size="sm" disabled={safePage >= safeTotalPages} onClick={() => onPageChange(safePage + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
};
