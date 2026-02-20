import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { ArrowClockwise, X } from '@phosphor-icons/react';
import type { BroadcastRun } from '../types';

type RepostConfirmModalProps = {
  run: BroadcastRun | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RepostConfirmModal({
  run,
  isSubmitting,
  onClose,
  onConfirm,
}: RepostConfirmModalProps) {
  return (
    <Modal isOpen={Boolean(run)} onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader>Repost Announcement</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            This will create a new run with the same message and audience settings.
          </p>
          {run ? (
            <div className="rounded-lg border border-default-200 bg-content2 p-3">
              <p className="text-xs uppercase tracking-wide text-default-500">
                Previous message
              </p>
              <p className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-sm">
                {run.message}
              </p>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} startContent={<X className="h-4 w-4" />}>
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={onConfirm}
            isLoading={isSubmitting}
            startContent={<ArrowClockwise className="h-4 w-4" />}
          >
            Repost
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
