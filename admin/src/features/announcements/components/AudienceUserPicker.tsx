import { useMemo, useState } from 'react';
import { Button, Chip, Input, Spinner } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from '@phosphor-icons/react';
import { listBroadcastUsers } from '../api';
import type { BroadcastUser } from '../types';

type AudienceUserPickerProps = {
  selectedUsers: BroadcastUser[];
  onAddUser: (user: BroadcastUser) => void;
  onRemoveUser: (userId: number) => void;
  disabled?: boolean;
};

export function AudienceUserPicker({
  selectedUsers,
  onAddUser,
  onRemoveUser,
  disabled = false,
}: AudienceUserPickerProps) {
  const [search, setSearch] = useState('');
  const trimmedSearch = search.trim();

  const { data, isFetching } = useQuery({
    queryKey: ['announcements', 'users', trimmedSearch],
    queryFn: async () => listBroadcastUsers(trimmedSearch, 1, 15),
    enabled: !disabled && trimmedSearch.length > 1,
    staleTime: 30_000,
  });

  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((user) => user.id)),
    [selectedUsers],
  );

  const availableUsers = useMemo(
    () => (data?.data ?? []).filter((user) => !selectedIds.has(user.id)),
    [data?.data, selectedIds],
  );

  return (
    <div className="space-y-3">
      <Input
        label="Search linked users"
        placeholder="Search by name, username, login, or telegram id"
        value={search}
        onValueChange={setSearch}
        isDisabled={disabled}
      />

      {trimmedSearch.length > 1 ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-default-200 bg-content1 p-2">
          {isFetching ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-default-500">
              <Spinner size="sm" />
              Searching users...
            </div>
          ) : availableUsers.length > 0 ? (
            availableUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-default-100"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user.firstName || 'Unnamed user'}
                  </p>
                  <p className="truncate text-xs text-default-500">
                    @{user.username || user.loginUsername || 'no_username'} · TG{' '}
                    {user.telegramId || 'none'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Plus className="h-3.5 w-3.5" />}
                  onPress={() => onAddUser(user)}
                >
                  Add
                </Button>
              </div>
            ))
          ) : (
            <p className="px-2 py-2 text-xs text-default-500">No matching linked users.</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {selectedUsers.map((user) => (
          <Chip
            key={user.id}
            variant="flat"
            color="primary"
            onClose={() => onRemoveUser(user.id)}
          >
            {user.firstName || `User #${user.id}`} · @{user.username || 'no_username'}
          </Chip>
        ))}
        {selectedUsers.length === 0 ? (
          <Chip
            variant="flat"
            color="default"
            startContent={<X className="h-3 w-3" />}
          >
            No users selected
          </Chip>
        ) : null}
      </div>
    </div>
  );
}
