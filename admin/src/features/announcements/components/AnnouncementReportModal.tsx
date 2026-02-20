import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  addToast,
} from '@heroui/react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, XCircle } from '@phosphor-icons/react';
import { DataTable } from '../../../components/table/DataTable';
import { DataTablePagination } from '../../../components/table/DataTablePagination';
import { getImageUrl } from '../../../types';
import {
  cancelBroadcast,
  getBroadcastRun,
  listBroadcastDeliveries,
  requeueUnknownDeliveries,
} from '../api';
import type {
  BroadcastDelivery,
  BroadcastDeliveryFilter,
} from '../types';
import {
  deliveryStatusColor,
  formatDeliveryStatus,
  formatRunStatus,
  runStatusColor,
} from '../utils';

type AnnouncementReportModalProps = {
  runId: number | null;
  isOpen: boolean;
  onClose: () => void;
};

const deliveryFilterTabs: { key: BroadcastDeliveryFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SENT', label: 'Received' },
  { key: 'NOT_SENT', label: 'Not Received' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'UNKNOWN', label: 'Unknown' },
];

export function AnnouncementReportModal({
  runId,
  isOpen,
  onClose,
}: AnnouncementReportModalProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<BroadcastDeliveryFilter>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    if (!isOpen) return;
    setFilter('ALL');
    setPage(1);
  }, [isOpen, runId]);

  const runQuery = useQuery({
    queryKey: ['announcements', 'run', runId],
    queryFn: async () => getBroadcastRun(runId as number),
    enabled: Boolean(runId && isOpen),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'QUEUED' || status === 'RUNNING') {
        return 4000;
      }
      return false;
    },
  });

  const deliveriesQuery = useQuery({
    queryKey: ['announcements', 'run', runId, 'deliveries', filter, page, limit],
    queryFn: async () =>
      listBroadcastDeliveries(runId as number, page, limit, filter),
    enabled: Boolean(runId && isOpen),
    refetchInterval: () => {
      const status = runQuery.data?.status;
      if (status === 'QUEUED' || status === 'RUNNING') {
        return 4000;
      }
      return false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => cancelBroadcast(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] }),
        queryClient.invalidateQueries({ queryKey: ['announcements', 'run', runId] }),
        queryClient.invalidateQueries({
          queryKey: ['announcements', 'run', runId, 'deliveries'],
        }),
      ]);
      addToast({
        title: 'Announcement run cancelled',
        description: 'Queued and retryable deliveries were stopped.',
        color: 'warning',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Cancel failed',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const requeueUnknownMutation = useMutation({
    mutationFn: async (id: number) => requeueUnknownDeliveries(id),
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] }),
        queryClient.invalidateQueries({ queryKey: ['announcements', 'run', runId] }),
        queryClient.invalidateQueries({
          queryKey: ['announcements', 'run', runId, 'deliveries'],
        }),
      ]);
      addToast({
        title: 'Unknown deliveries requeued',
        description: `${payload.requeued} deliveries were put back into the queue.`,
        color: 'success',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Requeue failed',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const columns = useMemo<ColumnDef<BroadcastDelivery>[]>(
    () => [
      {
        header: 'RECIPIENT',
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {row.original.recipient.firstName || 'Telegram user'}
            </p>
            <p className="text-xs text-default-500">
              @{row.original.recipient.username || 'no_username'} ·{' '}
              {row.original.recipient.sourceUser
                ? 'Linked platform user'
                : 'Bot subscriber'}
            </p>
          </div>
        ),
      },
      {
        header: 'TELEGRAM',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-default-500">
            {row.original.telegramId}
          </span>
        ),
      },
      {
        header: 'STATUS',
        cell: ({ row }) => (
          <Chip
            size="sm"
            variant="flat"
            color={deliveryStatusColor(row.original.status)}
          >
            {formatDeliveryStatus(row.original.status)}
          </Chip>
        ),
      },
      {
        header: 'ATTEMPTS',
        cell: ({ row }) => (
          <span className="text-sm text-default-600">{row.original.attemptCount}</span>
        ),
      },
      {
        header: 'LAST EVENT',
        cell: ({ row }) => {
          const timestamp =
            row.original.sentAt ||
            row.original.lastAttemptAt ||
            row.original.nextAttemptAt;
          if (!timestamp) return <span className="text-xs text-default-400">—</span>;
          return (
            <span className="text-xs text-default-500">
              {new Date(timestamp).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          );
        },
      },
      {
        header: 'ERROR',
        cell: ({ row }) => (
          <p className="max-w-64 truncate text-xs text-danger-500">
            {row.original.lastError || '—'}
          </p>
        ),
      },
    ],
    [],
  );

  const run = runQuery.data;
  const deliveries = deliveriesQuery.data?.data ?? [];
  const meta = deliveriesQuery.data?.meta;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);
  const isRunActive = run?.status === 'QUEUED' || run?.status === 'RUNNING';
  const notReceivedCount =
    (run?.failedCount ?? 0) + (run?.unknownCount ?? 0) + (run?.pendingCount ?? 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
      classNames={{ body: 'pt-2' }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>Announcement Report</span>
          {run ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="flat" color={runStatusColor(run.status)}>
                {formatRunStatus(run.status)}
              </Chip>
              <Chip size="sm" variant="flat" color="success">
                Received {run.sentCount}
              </Chip>
              <Chip size="sm" variant="flat" color="danger">
                Not received {notReceivedCount}
              </Chip>
            </div>
          ) : null}
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardBody className="space-y-1 p-3">
                <p className="text-xs text-default-500">Total recipients</p>
                <p className="text-lg font-semibold">{run?.totalRecipients ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-1 p-3">
                <p className="text-xs text-default-500">Received</p>
                <p className="text-lg font-semibold text-success-600">
                  {run?.sentCount ?? 0}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-1 p-3">
                <p className="text-xs text-default-500">Failed / Unknown</p>
                <p className="text-lg font-semibold text-danger-600">
                  {(run?.failedCount ?? 0) + (run?.unknownCount ?? 0)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-1 p-3">
                <p className="text-xs text-default-500">In progress</p>
                <p className="text-lg font-semibold text-warning-600">
                  {run?.pendingCount ?? 0}
                </p>
              </CardBody>
            </Card>
          </div>

          {run ? (
            <Card>
              <CardBody className="space-y-3 p-3">
                <div>
                  <p className="text-xs text-default-500">Caption</p>
                  <p className="whitespace-pre-wrap text-sm text-default-700">{run.message}</p>
                </div>
                {run.imagePaths && run.imagePaths.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-default-500">Attached images</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {run.imagePaths.map((imagePath, index) => (
                        <img
                          key={`${run.id}-announcement-image-${index}`}
                          src={getImageUrl(imagePath)}
                          alt={`Announcement attachment ${index + 1}`}
                          className="h-28 w-full rounded-md object-cover"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Tabs
            aria-label="Delivery filter"
            selectedKey={filter}
            onSelectionChange={(key) => {
              setFilter(String(key) as BroadcastDeliveryFilter);
              setPage(1);
            }}
            variant="underlined"
            color="primary"
          >
            {deliveryFilterTabs.map((tab) => (
              <Tab key={tab.key} title={tab.label} />
            ))}
          </Tabs>

          <DataTable columns={columns} data={deliveries} isLoading={deliveriesQuery.isLoading} />

          <DataTablePagination
            pagination={{
              count: meta?.total ?? 0,
              page: meta?.page ?? page,
              pageSize: meta?.limit ?? limit,
              totalPages,
            }}
            onPageChange={(nextPage) => {
              const safePage = Math.min(Math.max(1, nextPage), totalPages);
              setPage(safePage);
            }}
            onPageSizeChange={(size) => {
              setLimit(size);
              setPage(1);
            }}
          />
        </ModalBody>
        <ModalFooter className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {run?.unknownCount ? (
              <Button
                variant="flat"
                color="warning"
                startContent={<ArrowsClockwise className="h-4 w-4" />}
                isLoading={requeueUnknownMutation.isPending}
                onPress={() => {
                  if (!runId) return;
                  requeueUnknownMutation.mutate(runId);
                }}
              >
                Requeue Unknown
              </Button>
            ) : null}
            {isRunActive ? (
              <Button
                variant="flat"
                color="danger"
                startContent={<XCircle className="h-4 w-4" />}
                isLoading={cancelMutation.isPending}
                onPress={() => {
                  if (!runId) return;
                  cancelMutation.mutate(runId);
                }}
              >
                Cancel Run
              </Button>
            ) : null}
          </div>
          <Button variant="light" onPress={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
