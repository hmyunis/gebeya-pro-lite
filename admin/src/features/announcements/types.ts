import type { PaginatedResponse } from "../../types";

export type BroadcastKind = "announcement" | "news" | "promotion";

export type BroadcastTarget =
  | "all"
  | "users"
  | "bot_subscribers"
  | "active_bot_subscribers";

export type BroadcastRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "CANCELLED";

export type BroadcastDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT"
  | "UNKNOWN";

export type BroadcastDeliveryFilter =
  | "ALL"
  | "SENT"
  | "NOT_SENT"
  | "FAILED"
  | "UNKNOWN"
  | "PENDING";

export interface BroadcastRun {
  id: number;
  status: BroadcastRunStatus;
  kind: BroadcastKind;
  target: BroadcastTarget;
  targetUserIds: number[] | null;
  message: string;
  imagePaths?: string[] | null;
  requestedByUserId: number | null;
  totalRecipients: number;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  unknownCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastRunDetail extends BroadcastRun {
  deliverySummary: Record<BroadcastDeliveryStatus, number>;
}

export interface BroadcastDeliveryRecipient {
  userId: number | null;
  firstName: string | null;
  username: string | null;
  sourceUser: boolean;
}

export interface BroadcastDelivery {
  id: number;
  status: BroadcastDeliveryStatus;
  attemptCount: number;
  telegramId: string;
  telegramMessageId: string | null;
  sentAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  recipient: BroadcastDeliveryRecipient;
}

export interface BroadcastUser {
  id: number;
  firstName?: string | null;
  username?: string | null;
  telegramId: string | null;
  loginUsername?: string | null;
}

export interface CreateBroadcastPayload {
  message: string;
  kind: BroadcastKind;
  target: BroadcastTarget;
  userIds?: number[];
  images?: File[];
}

export interface BroadcastQueueResponse {
  runId: number;
  status: BroadcastRunStatus;
  kind: BroadcastKind;
  target: BroadcastTarget;
  totalRecipients: number;
  pendingCount: number;
}

export type BroadcastRunsResponse = PaginatedResponse<BroadcastRun>;
export type BroadcastUsersResponse = PaginatedResponse<BroadcastUser>;
export type BroadcastDeliveriesResponse = PaginatedResponse<BroadcastDelivery>;
