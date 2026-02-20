import { api } from '../../lib/api';
import type {
  BroadcastDeliveriesResponse,
  BroadcastDeliveryFilter,
  BroadcastQueueResponse,
  BroadcastRunDetail,
  BroadcastRunsResponse,
  BroadcastUsersResponse,
  CreateBroadcastPayload,
} from './types';

export async function createBroadcast(payload: CreateBroadcastPayload) {
  const images = Array.isArray(payload.images)
    ? payload.images.filter((file) => file instanceof File)
    : [];

  if (images.length > 0) {
    const formData = new FormData();
    formData.append('message', payload.message);
    formData.append('kind', payload.kind);
    formData.append('target', payload.target);
    if (payload.userIds && payload.userIds.length > 0) {
      formData.append('userIds', JSON.stringify(payload.userIds));
    }
    for (const image of images) {
      formData.append('images', image);
    }

    const response = await api.post<BroadcastQueueResponse>(
      '/announcements',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  }

  const response = await api.post<BroadcastQueueResponse>('/announcements', {
    message: payload.message,
    kind: payload.kind,
    target: payload.target,
    userIds: payload.userIds,
  });
  return response.data;
}

export async function listBroadcastRuns(page: number, limit: number) {
  const response = await api.get<BroadcastRunsResponse>('/announcements/runs', {
    params: { page, limit },
  });
  return response.data;
}

export async function getBroadcastRun(runId: number) {
  const response = await api.get<BroadcastRunDetail>(`/announcements/runs/${runId}`);
  return response.data;
}

export async function listBroadcastDeliveries(
  runId: number,
  page: number,
  limit: number,
  filter: BroadcastDeliveryFilter,
) {
  const response = await api.get<BroadcastDeliveriesResponse>(
    `/announcements/runs/${runId}/deliveries`,
    {
      params: { page, limit, status: filter },
    },
  );
  return response.data;
}

export async function listBroadcastUsers(
  search: string,
  page: number,
  limit: number,
) {
  const response = await api.get<BroadcastUsersResponse>('/announcements/audience/users', {
    params: {
      search: search.trim() || undefined,
      page,
      limit,
    },
  });
  return response.data;
}

export async function repostBroadcast(runId: number) {
  const response = await api.post<BroadcastQueueResponse>(
    `/announcements/runs/${runId}/repost`,
  );
  return response.data;
}

export async function cancelBroadcast(runId: number) {
  const response = await api.post(`/announcements/runs/${runId}/cancel`);
  return response.data;
}

export async function deleteBroadcastRun(runId: number) {
  const response = await api.delete<{ id: number; deleted: boolean }>(
    `/announcements/runs/${runId}`,
  );
  return response.data;
}

export async function requeueUnknownDeliveries(runId: number) {
  const response = await api.post<{ runId: number; requeued: number }>(
    `/announcements/runs/${runId}/requeue-unknown`,
  );
  return response.data;
}
