import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToast,
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
} from '@heroui/react';
import { ArrowLeft, Shield, ShieldCheck } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { DataTable } from '../../components/table/DataTable';
import { DataTablePagination } from '../../components/table/DataTablePagination';
import type {
  AdStatus,
  MerchantActivity,
  MerchantDetailResponse,
  PaginatedResponse,
} from '../../types';

function formatActivityType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(status: AdStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function MerchantDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { merchantId: merchantIdRaw } = useParams();
  const merchantId = Number.parseInt(merchantIdRaw ?? '', 10);

  const [activitiesPage, setActivitiesPage] = useState(1);
  const [activitiesLimit, setActivitiesLimit] = useState(12);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [pointsDelta, setPointsDelta] = useState('');
  const [pointsReason, setPointsReason] = useState('');

  const detailQuery = useQuery<MerchantDetailResponse>({
    queryKey: ['merchant', merchantId],
    queryFn: async () => (await api.get(`/merchants/${merchantId}`)).data,
    enabled: Number.isInteger(merchantId) && merchantId > 0,
  });

  const activitiesQuery = useQuery<PaginatedResponse<MerchantActivity>>({
    queryKey: ['merchant', merchantId, 'activities', activitiesPage, activitiesLimit],
    queryFn: async () =>
      (
        await api.get(`/merchants/${merchantId}/activities`, {
          params: {
            page: activitiesPage,
            limit: activitiesLimit,
          },
        })
      ).data,
    enabled: Number.isInteger(merchantId) && merchantId > 0,
  });

  const refreshMerchant = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['merchant', merchantId] }),
      queryClient.invalidateQueries({ queryKey: ['merchant', merchantId, 'activities'] }),
      queryClient.invalidateQueries({ queryKey: ['merchants'] }),
    ]);
  };

  const banMutation = useMutation({
    mutationFn: async (isBanned: boolean) =>
      api.post(`/merchants/${merchantId}/${isBanned ? 'unban' : 'ban'}`, {}),
    onSuccess: async () => {
      await refreshMerchant();
      addToast({
        title: 'Merchant updated',
        description: 'Ban status has been updated.',
        color: 'success',
      });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update merchant ban status';
      addToast({ title: 'Error', description: message, color: 'danger' });
    },
  });

  const reviewBlockMutation = useMutation({
    mutationFn: async (isReviewBlocked: boolean) =>
      api.post(
        `/merchants/${merchantId}/reviews/${isReviewBlocked ? 'unblock' : 'block'}`,
        {},
      ),
    onSuccess: async () => {
      await refreshMerchant();
      addToast({
        title: 'Merchant updated',
        description: 'Review access status has been updated.',
        color: 'success',
      });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update review access';
      addToast({ title: 'Error', description: message, color: 'danger' });
    },
  });

  const adjustPointsMutation = useMutation({
    mutationFn: async ({ delta, reason }: { delta: number; reason?: string }) =>
      api.post(`/merchants/${merchantId}/points/adjust`, {
        delta,
        reason: reason?.trim() || undefined,
      }),
    onSuccess: async () => {
      await refreshMerchant();
      setPointsDelta('');
      setPointsReason('');
      setIsAdjustModalOpen(false);
      addToast({
        title: 'Points updated',
        description: 'Merchant loyalty points were adjusted.',
        color: 'success',
      });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to adjust points';
      addToast({ title: 'Error', description: message, color: 'danger' });
    },
  });

  const activityColumns = useMemo<ColumnDef<MerchantActivity>[]>(
    () => [
      {
        header: 'WHEN',
        cell: ({ row }) => (
          <span className="text-xs text-default-600">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        header: 'ACTIVITY',
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.title}</p>
            <p className="text-xs text-default-500">
              {formatActivityType(row.original.activityType)}
            </p>
          </div>
        ),
      },
      {
        header: 'DETAILS',
        cell: ({ row }) => (
          <p className="max-w-md text-xs text-default-600">
            {row.original.description || '-'}
          </p>
        ),
      },
      {
        header: 'POINTS',
        cell: ({ row }) => {
          const value = row.original.pointsDelta;
          if (value === 0) {
            return <span className="text-xs text-default-500">0</span>;
          }

          return (
            <Chip size="sm" variant="flat" color={value > 0 ? 'success' : 'danger'}>
              {value > 0 ? `+${value}` : value}
            </Chip>
          );
        },
      },
      {
        header: 'BALANCE',
        cell: ({ row }) => (
          <span className="text-xs text-default-600">{row.original.pointsBalanceAfter ?? '-'}</span>
        ),
      },
    ],
    [],
  );

  if (!Number.isInteger(merchantId) || merchantId <= 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">Invalid merchant id.</p>
        <Button as={Link} to="/merchants" variant="flat">
          Back to merchants
        </Button>
      </div>
    );
  }

  const merchant = detailQuery.data?.merchant;
  const recentAds = detailQuery.data?.recentAds ?? [];
  const loyaltyConfig = detailQuery.data?.loyaltyConfig;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button
            variant="light"
            startContent={<ArrowLeft className="h-4 w-4" />}
            onPress={() => navigate('/merchants')}
            className="mb-2"
          >
            Back to merchants
          </Button>
          <h1 className="text-xl font-semibold">
            {merchant?.firstName?.trim() || 'Merchant'}
          </h1>
          <p className="text-sm text-default-500">
            @{merchant?.loginUsername || merchant?.username || 'no-username'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            color={merchant?.isBanned ? 'success' : 'danger'}
            variant="flat"
            startContent={merchant?.isBanned ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            isLoading={banMutation.isPending}
            onPress={() => {
              if (!merchant) return;
              banMutation.mutate(merchant.isBanned);
            }}
          >
            {merchant?.isBanned ? 'Unban merchant' : 'Ban merchant'}
          </Button>

          <Button
            color={merchant?.isReviewBlocked ? 'success' : 'warning'}
            variant="flat"
            isLoading={reviewBlockMutation.isPending}
            onPress={() => {
              if (!merchant) return;
              reviewBlockMutation.mutate(merchant.isReviewBlocked);
            }}
          >
            {merchant?.isReviewBlocked ? 'Unblock reviews' : 'Block reviews'}
          </Button>

          <Button
            color="secondary"
            variant="flat"
            onPress={() => setIsAdjustModalOpen(true)}
          >
            Adjust points
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Loyalty Points" value={String(merchant?.loyaltyPoints ?? 0)} />
        <StatCard title="Total Ads" value={String(merchant?.stats.totalAds ?? 0)} />
        <StatCard title="Approved Ads" value={String(merchant?.stats.approvedAds ?? 0)} />
        <StatCard title="Pending Ads" value={String(merchant?.stats.pendingAds ?? 0)} />
        <StatCard title="Total Views" value={String(merchant?.stats.totalViews ?? 0)} />
        <StatCard title="Unique Viewers" value={String(merchant?.stats.uniqueViewers ?? 0)} />
      </div>

      <Card>
        <CardBody className="space-y-2">
          <h2 className="text-sm font-semibold">Loyalty Rules</h2>
          <p className="text-sm text-default-600">
            +{loyaltyConfig?.pointsPerAdPost ?? 0} points per posted ad and +
            {loyaltyConfig?.pointsPerAdView ?? 0} point per unique product viewer per day.
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip color={merchant?.isBanned ? 'danger' : 'success'} variant="flat" size="sm">
              {merchant?.isBanned ? 'Account banned' : 'Account active'}
            </Chip>
            <Chip
              color={merchant?.isReviewBlocked ? 'warning' : 'success'}
              variant="flat"
              size="sm"
            >
              {merchant?.isReviewBlocked ? 'Review access blocked' : 'Review access active'}
            </Chip>
            <Chip variant="flat" size="sm">
              Last activity: {formatDateTime(merchant?.lastActivityAt)}
            </Chip>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Recent Ads</h2>
          </div>
          {detailQuery.isLoading ? (
            <p className="text-sm text-default-500">Loading merchant data...</p>
          ) : recentAds.length === 0 ? (
            <p className="text-sm text-default-500">No ads found for this merchant.</p>
          ) : (
            <div className="space-y-2">
              {recentAds.map((ad) => (
                <div
                  key={ad.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default-200 p-2"
                >
                  <div>
                    <p className="text-sm font-medium">{ad.name}</p>
                    <p className="text-xs text-default-500">#{ad.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip
                      size="sm"
                      variant="flat"
                      color={
                        ad.status === 'APPROVED'
                          ? 'success'
                          : ad.status === 'REJECTED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {formatStatus(ad.status)}
                    </Chip>
                    <span className="text-xs text-default-600">{ad.price} Birr</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Activity Timeline</h2>
        <DataTable
          columns={activityColumns}
          data={activitiesQuery.data?.data ?? []}
          isLoading={activitiesQuery.isLoading}
        />
        <DataTablePagination
          pagination={{
            count: activitiesQuery.data?.meta.total ?? 0,
            page: activitiesQuery.data?.meta.page ?? activitiesPage,
            pageSize: activitiesQuery.data?.meta.limit ?? activitiesLimit,
            totalPages: Math.max(1, activitiesQuery.data?.meta.totalPages ?? 1),
          }}
          onPageChange={(nextPage) => setActivitiesPage(Math.max(1, nextPage))}
          onPageSizeChange={(nextLimit) => {
            setActivitiesLimit(nextLimit);
            setActivitiesPage(1);
          }}
        />
      </div>

      <Modal isOpen={isAdjustModalOpen} onClose={() => setIsAdjustModalOpen(false)}>
        <ModalContent>
          <ModalHeader>Adjust Loyalty Points</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              type="number"
              label="Points delta"
              value={pointsDelta}
              onValueChange={setPointsDelta}
              description="Use positive numbers to add points, negative to deduct."
            />
            <Textarea
              label="Reason (optional)"
              value={pointsReason}
              onValueChange={setPointsReason}
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="secondary"
              isLoading={adjustPointsMutation.isPending}
              onPress={() => {
                const parsedDelta = Number.parseInt(pointsDelta, 10);
                if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
                  addToast({
                    title: 'Invalid value',
                    description: 'Please enter a non-zero integer for points delta.',
                    color: 'warning',
                  });
                  return;
                }

                adjustPointsMutation.mutate({
                  delta: parsedDelta,
                  reason: pointsReason,
                });
              }}
            >
              Apply
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardBody className="space-y-1 p-4">
        <p className="text-xs uppercase tracking-wide text-default-400">{title}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardBody>
    </Card>
  );
}
