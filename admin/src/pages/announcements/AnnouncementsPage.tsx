import { useMemo, useState } from 'react';
import { Card, CardBody, addToast } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTablePagination } from '../../components/table/DataTablePagination';
import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcastRun,
  listBroadcastRuns,
  repostBroadcast,
} from '../../features/announcements/api';
import { AnnouncementComposer } from '../../features/announcements/components/AnnouncementComposer';
import { DeleteRunConfirmModal } from '../../features/announcements/components/DeleteRunConfirmModal';
import { AnnouncementReportModal } from '../../features/announcements/components/AnnouncementReportModal';
import { AnnouncementRunsTable } from '../../features/announcements/components/AnnouncementRunsTable';
import { RepostConfirmModal } from '../../features/announcements/components/RepostConfirmModal';
import type {
  BroadcastKind,
  BroadcastRun,
  BroadcastTarget,
  BroadcastUser,
  CreateBroadcastPayload,
} from '../../features/announcements/types';

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<BroadcastKind>('announcement');
  const [target, setTarget] = useState<BroadcastTarget>('all');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<BroadcastUser[]>([]);
  const [runsPage, setRunsPage] = useState(1);
  const [runsLimit, setRunsLimit] = useState(10);
  const [reportRunId, setReportRunId] = useState<number | null>(null);
  const [repostTarget, setRepostTarget] = useState<BroadcastRun | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BroadcastRun | null>(null);

  const runsQuery = useQuery({
    queryKey: ['announcements', 'runs', runsPage, runsLimit],
    queryFn: async () => listBroadcastRuns(runsPage, runsLimit),
    refetchInterval: (query) => {
      const hasActive = (query.state.data?.data ?? []).some(
        (run) => run.status === 'QUEUED' || run.status === 'RUNNING',
      );
      return hasActive ? 4000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateBroadcastPayload) => createBroadcast(payload),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] });
      setMessage('');
      setImages([]);
      setSelectedUsers([]);
      addToast({
        title: 'Announcement queued',
        description: `Run #${result.runId} queued for ${result.totalRecipients} recipients.`,
        color: 'success',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Failed to queue announcement',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (runId: number) => cancelBroadcast(runId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] });
      addToast({
        title: 'Run cancelled',
        description: 'The active run was stopped.',
        color: 'warning',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Unable to cancel run',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const repostMutation = useMutation({
    mutationFn: async (runId: number) => repostBroadcast(runId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] });
      setRepostTarget(null);
      addToast({
        title: 'Announcement reposted',
        description: `New run #${result.runId} has been queued.`,
        color: 'success',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Repost failed',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (runId: number) => deleteBroadcastRun(runId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements', 'runs'] });
      setDeleteTarget(null);
      addToast({
        title: 'History deleted',
        description: 'Announcement run history has been removed.',
        color: 'success',
      });
    },
    onError: (error: any) => {
      addToast({
        title: 'Delete failed',
        description: error?.response?.data?.message || error?.message || 'Try again.',
        color: 'danger',
      });
    },
  });

  const runs = runsQuery.data?.data ?? [];
  const runsMeta = runsQuery.data?.meta;
  const totalPages = Math.max(1, runsMeta?.totalPages ?? 1);
  const runsOffset = ((runsMeta?.page ?? 1) - 1) * (runsMeta?.limit ?? runs.length);

  const selectedUserIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers],
  );

  const handleAddSelectedUser = (user: BroadcastUser) => {
    if (selectedUserIds.has(user.id)) {
      return;
    }
    setSelectedUsers((prev) => [...prev, user]);
  };

  const handleRemoveSelectedUser = (userId: number) => {
    setSelectedUsers((prev) => prev.filter((user) => user.id !== userId));
  };

  const handleTargetChange = (nextTarget: BroadcastTarget) => {
    setTarget(nextTarget);
    if (nextTarget !== 'users') {
      setSelectedUsers([]);
    }
  };

  const handleQueueBroadcast = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      addToast({
        title: 'Message required',
        description: 'Write a message before sending.',
        color: 'warning',
      });
      return;
    }

    if (target === 'users' && selectedUsers.length === 0) {
      addToast({
        title: 'Select recipients',
        description: 'Choose at least one linked user for specific-user targeting.',
        color: 'warning',
      });
      return;
    }

    const payload: CreateBroadcastPayload = {
      message: trimmedMessage,
      kind,
      target,
      userIds: target === 'users' ? selectedUsers.map((user) => user.id) : undefined,
      images,
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-default-500">
          Broadcast announcements, news, or promotions to linked users or Telegram subscribers.
        </p>
      </div>

      <AnnouncementComposer
        kind={kind}
        target={target}
        message={message}
        images={images}
        selectedUsers={selectedUsers}
        isSubmitting={createMutation.isPending}
        onKindChange={setKind}
        onTargetChange={handleTargetChange}
        onMessageChange={setMessage}
        onImagesChange={setImages}
        onAddUser={handleAddSelectedUser}
        onRemoveUser={handleRemoveSelectedUser}
        onSubmit={handleQueueBroadcast}
      />

      <Card>
        <CardBody className="space-y-3 p-5">
          <div>
            <h2 className="text-lg font-semibold">Announcement History</h2>
            <p className="text-sm text-default-500">
              Review delivery outcomes and repost any previous run with one click.
            </p>
          </div>

          <AnnouncementRunsTable
            runs={runs}
            isLoading={runsQuery.isLoading}
            offset={runsOffset}
            isCancelling={cancelMutation.isPending}
            isDeleting={deleteMutation.isPending}
            onViewReport={(run) => setReportRunId(run.id)}
            onRepost={(run) => setRepostTarget(run)}
            onCancel={(run) => cancelMutation.mutate(run.id)}
            onDelete={(run) => setDeleteTarget(run)}
          />

          <DataTablePagination
            pagination={{
              count: runsMeta?.total ?? 0,
              page: runsMeta?.page ?? runsPage,
              pageSize: runsMeta?.limit ?? runsLimit,
              totalPages,
            }}
            onPageChange={(nextPage) => {
              const safePage = Math.min(Math.max(1, nextPage), totalPages);
              setRunsPage(safePage);
            }}
            onPageSizeChange={(size) => {
              setRunsLimit(size);
              setRunsPage(1);
            }}
          />
        </CardBody>
      </Card>

      <AnnouncementReportModal
        runId={reportRunId}
        isOpen={Boolean(reportRunId)}
        onClose={() => setReportRunId(null)}
      />

      <RepostConfirmModal
        run={repostTarget}
        isSubmitting={repostMutation.isPending}
        onClose={() => setRepostTarget(null)}
        onConfirm={() => {
          if (!repostTarget) return;
          repostMutation.mutate(repostTarget.id);
        }}
      />

      <DeleteRunConfirmModal
        run={deleteTarget}
        isSubmitting={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
