import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import {
  ImageSquare,
  Megaphone,
  PaperPlaneTilt,
  Trash,
} from '@phosphor-icons/react';
import type {
  BroadcastKind,
  BroadcastTarget,
  BroadcastUser,
} from '../types';
import { kindOptions, targetOptions } from '../utils';
import { AudienceUserPicker } from './AudienceUserPicker';

type AnnouncementComposerProps = {
  kind: BroadcastKind;
  target: BroadcastTarget;
  message: string;
  images: File[];
  selectedUsers: BroadcastUser[];
  isSubmitting: boolean;
  onKindChange: (value: BroadcastKind) => void;
  onTargetChange: (value: BroadcastTarget) => void;
  onMessageChange: (value: string) => void;
  onImagesChange: (files: File[]) => void;
  onAddUser: (user: BroadcastUser) => void;
  onRemoveUser: (userId: number) => void;
  onSubmit: () => void;
};

export function AnnouncementComposer({
  kind,
  target,
  message,
  images,
  selectedUsers,
  isSubmitting,
  onKindChange,
  onTargetChange,
  onMessageChange,
  onImagesChange,
  onAddUser,
  onRemoveUser,
  onSubmit,
}: AnnouncementComposerProps) {
  const isUsersTarget = target === 'users';
  const isBotSubscribersTarget = target === 'bot_subscribers';
  const isActiveBotSubscribersTarget = target === 'active_bot_subscribers';
  const isSubmitDisabled =
    !message.trim() || (isUsersTarget && selectedUsers.length === 0);
  const remainingSlots = Math.max(0, 3 - images.length);

  return (
    <Card>
      <CardBody className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Create Announcement</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select
            label="Content Type"
            selectedKeys={new Set([kind])}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (!key) return;
              onKindChange(String(key) as BroadcastKind);
            }}
          >
            {kindOptions.map((option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ))}
          </Select>

          <Select
            label="Target Mode"
            selectedKeys={new Set([target])}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (!key) return;
              onTargetChange(String(key) as BroadcastTarget);
            }}
          >
            {targetOptions.map((option) => (
              <SelectItem key={option.key} description={option.description}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

        </div>

        <Textarea
          label="Message"
          value={message}
          onValueChange={onMessageChange}
          placeholder="Write your announcement/news/promotion message (HTML tags supported by Telegram)."
          minRows={6}
          maxRows={10}
          description="Telegram message max: 4000 characters. This will be used as caption."
        />

        <div className="space-y-2 rounded-xl border border-default-200 p-3">
          <div className="flex items-center gap-2">
            <ImageSquare className="h-4 w-4 text-default-500" />
            <p className="text-sm font-medium">Images (optional, up to 3)</p>
          </div>
          <Input
            type="file"
            accept="image/*"
            multiple
            isDisabled={remainingSlots === 0}
            description={
              remainingSlots > 0
                ? `${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} left`
                : 'Maximum images selected'
            }
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []).filter((file) =>
                file.type.startsWith('image/'),
              );
              const merged = [...images, ...selected].slice(0, 3);
              onImagesChange(merged);
              event.currentTarget.value = '';
            }}
          />
          {images.length > 0 ? (
            <div className="space-y-2">
              {images.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between rounded-lg border border-default-200 px-3 py-2"
                >
                  <p className="max-w-[70%] truncate text-xs text-default-600">{file.name}</p>
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    startContent={<Trash className="h-3.5 w-3.5" />}
                    onPress={() =>
                      onImagesChange(images.filter((_, currentIndex) => currentIndex !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {isUsersTarget ? (
          <AudienceUserPicker
            selectedUsers={selectedUsers}
            onAddUser={onAddUser}
            onRemoveUser={onRemoveUser}
          />
        ) : null}

        {isBotSubscribersTarget ? (
          <Chip variant="flat" color="warning">
            Sends to bot subscribers, including users who are not registered on the platform.
          </Chip>
        ) : null}
        {isActiveBotSubscribersTarget ? (
          <Chip variant="flat" color="success">
            Sends to active subscribers seen recently on Telegram.
          </Chip>
        ) : null}

        <div className="flex justify-end">
          <Button
            color="primary"
            isLoading={isSubmitting}
            isDisabled={isSubmitDisabled}
            onPress={onSubmit}
            startContent={<PaperPlaneTilt className="h-4 w-4" />}
          >
            Send Now
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
