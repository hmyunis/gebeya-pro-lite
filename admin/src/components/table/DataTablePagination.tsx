import { Button, Select, SelectItem } from "@heroui/react";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";

interface PaginationData {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface DataTablePaginationProps {
  pagination: PaginationData;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function DataTablePagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const hasPreviousPage = pagination.page > 1;
  const hasNextPage = pagination.page < pagination.totalPages;

  const firstItem = pagination.count === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem =
    pagination.count === 0
      ? 0
      : Math.min(pagination.page * pagination.pageSize, pagination.count);

  return (
    <div className="flex items-center justify-between flex-wrap gap-4 py-2 sm:p-4 border-t dark:border-slate-700">
      <div className="text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
        {pagination.count > 0
          ? `Showing ${firstItem}-${lastItem} of ${pagination.count} results`
          : "No results"}
      </div>

      <div className="flex flex-wrap items-center justify-between w-full sm:w-fit sm:gap-8">
        <div className="flex items-center gap-2">
          <Select
            label={`Rows per page: ${pagination.pageSize}`}
            labelPlacement="outside-left"
            className="min-w-18.75 [&_button]:bg-transparent [&_button]:hover:bg-transparent [&_button]:focus:ring-0 [&_button]:border-0"
            onSelectionChange={(keys) => {
              const newSize = Array.from(keys)[0];
              if (newSize) {
                onPageSizeChange(Number(newSize));
              }
            }}
            popoverProps={{ className: "w-20" }}
            selectedKeys={new Set([String(pagination.pageSize)])}
          >
            {[10, 20, 30, 40, 50].map((size) => (
              <SelectItem key={String(size)} id={`${size}`} textValue={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between w-full sm:w-fit sm:justify-start gap-4">
          <p className="text-sm font-medium whitespace-nowrap">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              isIconOnly
              onPress={() => onPageChange(1)}
              isDisabled={!hasPreviousPage}
              aria-label="First page"
              className="h-9 px-0.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-white dark:hover:text-white"
            >
              <CaretDoubleLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              isIconOnly
              onPress={() => onPageChange(pagination.page - 1)}
              isDisabled={!hasPreviousPage}
              aria-label="Previous page"
              className="h-9 px-0.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-white dark:hover:text-white"
            >
              <CaretLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              isIconOnly
              onPress={() => onPageChange(pagination.page + 1)}
              isDisabled={!hasNextPage}
              aria-label="Next page"
              className="h-9 px-0.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-white dark:hover:text-white"
            >
              <CaretRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              isIconOnly
              onPress={() => onPageChange(pagination.totalPages)}
              isDisabled={!hasNextPage}
              aria-label="Last page"
              className="h-9 px-0.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-white dark:hover:text-white"
            >
              <CaretDoubleRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

