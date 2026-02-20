import { useMemo } from 'react';
import { Button, Chip } from '@heroui/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowClockwise, Eye, Trash, XCircle } from '@phosphor-icons/react';
import { DataTable } from '../../../components/table/DataTable';
import type { BroadcastRun } from '../types';
import {
  formatRunStatus,
  formatTargetLabel,
  runStatusColor,
} from '../utils';

type AnnouncementRunsTableProps = {
  runs: BroadcastRun[];
  isLoading: boolean;
  offset: number;
  isCancelling: boolean;
  isDeleting: boolean;
  onViewReport: (run: BroadcastRun) => void;
  onRepost: (run: BroadcastRun) => void;
  onCancel: (run: BroadcastRun) => void;
  onDelete: (run: BroadcastRun) => void;
};

export function AnnouncementRunsTable({
  runs,
  isLoading,
  offset,
  isCancelling,
  isDeleting,
  onViewReport,
  onRepost,
  onCancel,
  onDelete,
}: AnnouncementRunsTableProps) {
  const columns = useMemo<ColumnDef<BroadcastRun>[]>(
    () => [
      {
        header: '#',
        cell: ({ row }) => (
          <p className="text-sm text-default-500">{offset + row.index + 1}</p>
        ),
      },
      {
        header: 'CAMPAIGN',
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm font-semibold capitalize">{row.original.kind}</p>
            <p className="max-w-72 truncate text-xs text-default-500">
              {row.original.message}
            </p>
            {row.original.imagePaths && row.original.imagePaths.length > 0 ? (
              <Chip size="sm" variant="flat" color="primary">
                {row.original.imagePaths.length} image
                {row.original.imagePaths.length === 1 ? '' : 's'}
              </Chip>
            ) : null}
          </div>
        ),
      },
      {
        header: 'AUDIENCE',
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="text-sm text-default-700">
              {formatTargetLabel(
                row.original.target,
                row.original.targetUserIds?.length ?? 0,
              )}
            </p>
            <p className="text-xs text-default-500">Total: {row.original.totalRecipients}</p>
          </div>
        ),
      },
      {
        header: 'STATUS',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Chip size="sm" variant="flat" color={runStatusColor(row.original.status)}>
              {formatRunStatus(row.original.status)}
            </Chip>
            <p className="text-xs text-default-500">
              Sent {row.original.sentCount} · Failed {row.original.failedCount} · Unknown{' '}
              {row.original.unknownCount}
            </p>
          </div>
        ),
      },
      {
        header: 'CREATED',
        cell: ({ row }) => (
          <span className="text-xs text-default-500">
            {new Date(row.original.createdAt).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ),
      },
      {
        header: 'ACTIONS',
        cell: ({ row }) => {
          const isActive =
            row.original.status === 'QUEUED' || row.original.status === 'RUNNING';

          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="flat"
                startContent={<Eye className="h-3.5 w-3.5" />}
                onPress={() => onViewReport(row.original)}
              >
                Report
              </Button>
              <Button
                size="sm"
                variant="light"
                startContent={<ArrowClockwise className="h-3.5 w-3.5" />}
                onPress={() => onRepost(row.original)}
              >
                Repost
              </Button>
              {isActive ? (
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isLoading={isCancelling}
                  startContent={<XCircle className="h-3.5 w-3.5" />}
                  onPress={() => onCancel(row.original)}
                >
                  Cancel
                </Button>
              ) : null}
              {!isActive ? (
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isLoading={isDeleting}
                  startContent={<Trash className="h-3.5 w-3.5" />}
                  onPress={() => onDelete(row.original)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [isCancelling, isDeleting, offset, onCancel, onDelete, onRepost, onViewReport],
  );

  return <DataTable columns={columns} data={runs} isLoading={isLoading} />;
}
