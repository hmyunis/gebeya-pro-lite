import { useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Chip, Input } from '@heroui/react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { DataTable } from '../../components/table/DataTable';
import { DataTablePagination } from '../../components/table/DataTablePagination';
import { getImageUrl, type MerchantSummary, type PaginatedResponse } from '../../types';

export default function MerchantsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const merchantsQuery = useQuery<PaginatedResponse<MerchantSummary>>({
    queryKey: ['merchants', page, pageSize, search],
    queryFn: async () =>
      (
        await api.get('/merchants', {
          params: {
            page,
            limit: pageSize,
            q: search.trim() || undefined,
          },
        })
      ).data,
  });

  const merchants = merchantsQuery.data?.data ?? [];
  const meta = merchantsQuery.data?.meta;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);
  const rowOffset = ((meta?.page ?? 1) - 1) * (meta?.limit ?? pageSize);

  const columns = useMemo<ColumnDef<MerchantSummary>[]>(
    () => [
      {
        header: '#',
        cell: ({ row }) => (
          <span className="text-xs text-default-500">{rowOffset + row.index + 1}</span>
        ),
      },
      {
        header: 'MERCHANT',
        cell: ({ row }) => {
          const merchant = row.original;
          const displayName = merchant.firstName?.trim() || 'Unnamed merchant';
          const username = merchant.loginUsername || merchant.username || '-';

          return (
            <div className="flex items-center gap-3">
              <Avatar
                src={getImageUrl(merchant.avatarUrl ?? null)}
                name={displayName}
                className="h-9 w-9"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-default-500">@{username}</p>
              </div>
            </div>
          );
        },
      },
      {
        header: 'ADS',
        cell: ({ row }) => (
          <div className="space-y-1 text-xs text-default-600">
            <p>Total: {row.original.stats.totalAds}</p>
            <p>
              Pending {row.original.stats.pendingAds} | Approved {row.original.stats.approvedAds}
            </p>
          </div>
        ),
      },
      {
        header: 'VIEWS',
        cell: ({ row }) => (
          <div className="space-y-1 text-xs text-default-600">
            <p>Total: {row.original.stats.totalViews}</p>
            <p>Unique visitors: {row.original.stats.uniqueViewers}</p>
          </div>
        ),
      },
      {
        header: 'POINTS',
        cell: ({ row }) => (
          <Chip color="secondary" variant="flat" size="sm">
            {row.original.loyaltyPoints}
          </Chip>
        ),
      },
      {
        header: 'STATUS',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Chip
              size="sm"
              variant="flat"
              color={row.original.isBanned ? 'danger' : 'success'}
            >
              {row.original.isBanned ? 'Banned' : 'Active'}
            </Chip>
            <Chip
              size="sm"
              variant="flat"
              color={row.original.isReviewBlocked ? 'warning' : 'success'}
            >
              {row.original.isReviewBlocked ? 'Reviews blocked' : 'Reviews open'}
            </Chip>
          </div>
        ),
      },
      {
        header: 'ACTIONS',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={() => navigate(`/merchants/${row.original.id}`)}
          >
            Open
          </Button>
        ),
      },
    ],
    [navigate, rowOffset],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Merchants</h1>
          <p className="text-sm text-default-500">
            Monitor merchant activity, loyalty points, and moderation state.
          </p>
        </div>

        <Input
          value={search}
          onValueChange={setSearch}
          startContent={<MagnifyingGlass className="h-4 w-4 text-default-400" />}
          placeholder="Search merchant"
          className="w-full sm:max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={merchants}
        isLoading={merchantsQuery.isLoading}
        onRowClick={(merchant) => navigate(`/merchants/${merchant.id}`)}
      />

      <DataTablePagination
        pagination={{
          count: meta?.total ?? 0,
          page: meta?.page ?? page,
          pageSize: meta?.limit ?? pageSize,
          totalPages,
        }}
        onPageChange={(nextPage) => setPage(Math.max(1, nextPage))}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />
    </div>
  );
}
