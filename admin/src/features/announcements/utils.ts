import type {
  BroadcastDeliveryStatus,
  BroadcastKind,
  BroadcastRunStatus,
  BroadcastTarget,
} from './types';

type ChipColor = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export const kindOptions: { key: BroadcastKind; label: string }[] = [
  { key: 'announcement', label: 'Announcement' },
  { key: 'news', label: 'News' },
  { key: 'promotion', label: 'Promotion' },
];

export const targetOptions: { key: BroadcastTarget; label: string; description: string }[] = [
  {
    key: 'all',
    label: 'All Linked Users',
    description: 'Send to every platform user linked to Telegram.',
  },
  {
    key: 'users',
    label: 'Specific Users',
    description: 'Pick exact linked users by search.',
  },
  {
    key: 'bot_subscribers',
    label: 'Bot Subscribers',
    description: 'Send to everyone who started the bot, including non-platform users.',
  },
  {
    key: 'active_bot_subscribers',
    label: 'Active Bot Subscribers',
    description: 'Send to active bot subscribers seen recently.',
  },
];

export function formatRunStatus(status: BroadcastRunStatus) {
  if (status === 'COMPLETED_WITH_ERRORS') return 'COMPLETED WITH ERRORS';
  return status;
}

export function runStatusColor(status: BroadcastRunStatus): ChipColor {
  switch (status) {
    case 'QUEUED':
      return 'warning';
    case 'RUNNING':
      return 'primary';
    case 'COMPLETED':
      return 'success';
    case 'COMPLETED_WITH_ERRORS':
      return 'warning';
    case 'CANCELLED':
      return 'default';
    default:
      return 'default';
  }
}

export function deliveryStatusColor(status: BroadcastDeliveryStatus): ChipColor {
  switch (status) {
    case 'SENT':
      return 'success';
    case 'FAILED_PERMANENT':
    case 'UNKNOWN':
      return 'danger';
    case 'FAILED_RETRYABLE':
    case 'PENDING':
    case 'PROCESSING':
      return 'warning';
    default:
      return 'default';
  }
}

export function formatTargetLabel(
  target: BroadcastTarget,
  selectedCount: number,
) {
  if (target === 'users') {
    return `Specific users (${selectedCount})`;
  }
  if (target === 'bot_subscribers') {
    return 'Bot subscribers';
  }
  if (target === 'active_bot_subscribers') {
    return 'Active bot subscribers';
  }
  return 'All linked users';
}

export function formatDeliveryStatus(status: BroadcastDeliveryStatus) {
  if (status === 'FAILED_PERMANENT') return 'FAILED';
  if (status === 'FAILED_RETRYABLE') return 'RETRYING';
  return status;
}
