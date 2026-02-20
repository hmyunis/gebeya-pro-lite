import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Images,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/features/i18n";

const MAX_AD_IMAGES = 5;
const SWIPE_THRESHOLD = 40;

export type AdImageSelection = {
  newFiles: File[];
  filledSlotsCount: number;
};

type ImageSlot = { kind: "empty" } | { kind: "new"; file: File; previewUrl: string };

function buildEmptySlots(): ImageSlot[] {
  return new Array(MAX_AD_IMAGES).fill(null).map(() => ({ kind: "empty" }));
}

function revokeSlotPreview(slot: ImageSlot) {
  if (slot.kind === "new") {
    URL.revokeObjectURL(slot.previewUrl);
  }
}

export default function AdImageUploader({
  onSelectionChange,
}: {
  onSelectionChange: (selection: AdImageSelection) => void;
}) {
  const { t } = useI18n();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const slotsRef = useRef<ImageSlot[]>([]);
  const [slots, setSlots] = useState<ImageSlot[]>(() => buildEmptySlots());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    const newFiles = slots
      .filter((slot): slot is Extract<ImageSlot, { kind: "new" }> => slot.kind === "new")
      .map((slot) => slot.file);

    onSelectionChange({
      newFiles,
      filledSlotsCount: newFiles.length,
    });
  }, [onSelectionChange, slots]);

  useEffect(
    () => () => {
      slotsRef.current.forEach((slot) => revokeSlotPreview(slot));
    },
    [],
  );

  const previewImages = useMemo(
    () =>
      slots
        .filter((slot): slot is Extract<ImageSlot, { kind: "new" }> => slot.kind === "new")
        .map((slot) => ({
          url: slot.previewUrl,
          label: slot.file.name,
        })),
    [slots],
  );

  useEffect(() => {
    if (!isPreviewOpen) return;
    if (previewImages.length === 0) {
      setIsPreviewOpen(false);
      return;
    }
    if (activePreviewIndex > previewImages.length - 1) {
      setActivePreviewIndex(0);
    }
  }, [activePreviewIndex, isPreviewOpen, previewImages.length]);

  const canSlidePreview = previewImages.length > 1;
  const currentPreview = previewImages[activePreviewIndex];

  const nextPreview = () =>
    setActivePreviewIndex((current) => (current + 1) % previewImages.length);
  const previousPreview = () =>
    setActivePreviewIndex((current) =>
      current === 0 ? previewImages.length - 1 : current - 1,
    );

  const onSlotImagePick = (slotIndex: number, file?: File) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setSlots((currentSlots) => {
      const nextSlots = [...currentSlots];
      revokeSlotPreview(nextSlots[slotIndex]);
      nextSlots[slotIndex] = {
        kind: "new",
        file,
        previewUrl,
      };
      return nextSlots;
    });
  };

  const clearSlot = (slotIndex: number) => {
    setSlots((currentSlots) => {
      const nextSlots = [...currentSlots];
      revokeSlotPreview(nextSlots[slotIndex]);
      nextSlots[slotIndex] = { kind: "empty" };
      return nextSlots;
    });
  };

  const clearAllSlots = () => {
    setSlots((currentSlots) => {
      currentSlots.forEach((slot) => revokeSlotPreview(slot));
      return buildEmptySlots();
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {slots.map((slot, index) => {
          const slotUrl = slot.kind === "new" ? slot.previewUrl : null;

          return (
            <div
              key={`product-image-slot-${index}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-default-300 bg-default-100"
            >
              <input
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  onSlotImagePick(index, file);
                  event.target.value = "";
                }}
              />

              {slotUrl ? (
                <img
                  src={slotUrl}
                  alt={t("adImageUploader.slotAlt", { index: index + 1 })}
                  className="h-full w-full object-cover"
                />
              ) : (
                <button
                  type="button"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 text-default-500 transition hover:bg-default-200"
                  onClick={() => inputRefs.current[index]?.click()}
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-[10px] font-medium">
                    {t("adImageUploader.slotLabel", { index: index + 1 })}
                  </span>
                </button>
              )}

              <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                {index + 1}
              </span>

              {slotUrl ? (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1 py-1">
                  <button
                    type="button"
                    className="rounded p-1 text-white/90 transition hover:bg-black/30"
                    onClick={() => inputRefs.current[index]?.click()}
                    aria-label={t("adImageUploader.uploadSlotAria", {
                      index: index + 1,
                    })}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-white/90 transition hover:bg-black/30"
                    onClick={() => clearSlot(index)}
                    aria-label={t("adImageUploader.removeSlotAria", {
                      index: index + 1,
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="flat"
          startContent={<Eye className="h-4 w-4" />}
          onPress={() => {
            setActivePreviewIndex(0);
            setIsPreviewOpen(true);
          }}
          isDisabled={previewImages.length === 0}
        >
          {t("adImageUploader.previewImages")}
        </Button>
        <Button
          size="sm"
          variant="light"
          color="danger"
          startContent={<X className="h-4 w-4" />}
          onPress={clearAllSlots}
          isDisabled={previewImages.length === 0}
        >
          {t("adImageUploader.clearAll")}
        </Button>
      </div>

      <p className="text-xs text-default-400">
        {t("adImageUploader.limitHint", { count: MAX_AD_IMAGES })}
      </p>

      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <Images className="h-5 w-5 text-primary" />
            <span>{t("adImageUploader.modalTitle")}</span>
          </ModalHeader>
          <ModalBody>
            {currentPreview ? (
              <div
                className="relative aspect-square overflow-hidden rounded-xl bg-default-100"
                onTouchStart={(event) => {
                  touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  if (!canSlidePreview) return;
                  if (touchStartXRef.current === null) return;
                  const touchEndX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
                  const delta = touchEndX - touchStartXRef.current;
                  if (Math.abs(delta) < SWIPE_THRESHOLD) return;
                  if (delta > 0) {
                    previousPreview();
                  } else {
                    nextPreview();
                  }
                }}
              >
                <img
                  src={currentPreview.url}
                  alt={currentPreview.label}
                  className="h-full w-full object-cover"
                />
                {canSlidePreview ? (
                  <>
                    <button
                      type="button"
                      onClick={previousPreview}
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white"
                      aria-label={t("adImageUploader.previousImage")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={nextPreview}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white"
                      aria-label={t("adImageUploader.nextImage")}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {previewImages.length > 0 ? (
              <div className="flex items-center justify-center gap-1.5">
                {previewImages.map((_, index) => (
                  <button
                    key={`preview-dot-${index}`}
                    type="button"
                    onClick={() => setActivePreviewIndex(index)}
                    className={[
                      "h-1.5 rounded-full transition-all",
                      index === activePreviewIndex ? "w-4 bg-primary" : "w-1.5 bg-default-300",
                    ].join(" ")}
                    aria-label={t("adImageUploader.viewImageAria", { index: index + 1 })}
                  />
                ))}
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setIsPreviewOpen(false)}>
              {t("common.close")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
