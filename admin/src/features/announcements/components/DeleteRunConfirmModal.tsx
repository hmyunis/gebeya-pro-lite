import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { Trash, X } from '@phosphor-icons/react';
import type { BroadcastRun } from '../types';

type DeleteRunConfirmModalProps = {
  run: BroadcastRun | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteRunConfirmModal({
  run,
  isSubmitting,
  onClose,
  onConfirm,
}: DeleteRunConfirmModalProps) {
  return (
    <Modal isOpen={Boolean(run)} onClose={onClose} size="md">
      <ModalContent>
        <ModalHeader>Delete History Item</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            This permanently deletes the selected announcement history record and
            its delivery logs.
          </p>
          {run ? (
            <div className="rounded-lg border border-default-200 bg-content2 p-3">
              <p className="text-xs text-default-500">Run #{run.id}</p>
              <p className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-sm">
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
            color="danger"
            onPress={onConfirm}
            isLoading={isSubmitting}
            startContent={<Trash className="h-4 w-4" />}
          >
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
