import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
  addToast,
} from "@heroui/react";
import { useMutation } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";

import { api, getApiErrorMessage } from "@/lib/api";
import { requireLogin } from "@/features/auth/store/authStore";
import { useI18n } from "@/features/i18n";
import type { Ad, Category } from "@/features/products/types";
import { isValidEthiopianPhoneInput } from "@/features/products/utils/phoneNumber";
import { getCurrentPathWithUpdatedQueryParam } from "@/lib/navigation";
import AdImageUploader, { type AdImageSelection } from "./AdImageUploader";

const DRAFT_KEY = "gebeya-post-ad-draft-v1";

type DraftShape = {
  step: 1 | 2;
  name: string;
  price: string;
  description: string;
  categoryId: string | null;
  address: string;
  phoneNumber: string;
  itemDetails: Record<string, string | boolean>;
};

export function PostAdModal({
  isOpen,
  onClose,
  categories,
  isLoggedIn,
  onPosted,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  isLoggedIn: boolean;
  onPosted: (createdAd?: Ad) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [itemDetails, setItemDetails] = useState<Record<string, string | boolean>>({});
  const [imageSelection, setImageSelection] = useState<AdImageSelection>({
    newFiles: [],
    filledSlotsCount: 0,
  });

  const phoneNumberError = useMemo(() => {
    const trimmed = phoneNumber.trim();
    if (!trimmed) return null;
    if (isValidEthiopianPhoneInput(trimmed)) return null;
    return t("merchantPostAd.phoneFormatError");
  }, [phoneNumber, t]);

  const activeCategory = useMemo(
    () =>
      categories.find((entry) => String(entry.id) === String(categoryId ?? "")) ??
      null,
    [categories, categoryId],
  );
  const dynamicFields = activeCategory?.dynamicFields ?? [];
  const reviewDynamicRows = useMemo(
    () =>
      dynamicFields.map((field) => {
        const rawValue = itemDetails[field.key];
        if (field.type === "boolean") {
          return {
            key: field.key,
            label: field.label,
            value: rawValue
              ? t("merchantPostAd.boolean.yes")
              : t("merchantPostAd.boolean.no"),
          };
        }
        const textValue = String(rawValue ?? "").trim();
        return {
          key: field.key,
          label: field.label,
          value: textValue || "-",
        };
      }),
    [dynamicFields, itemDetails, t],
  );
  const reviewImagePreviews = useMemo(
    () =>
      imageSelection.newFiles.slice(0, 5).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [imageSelection.newFiles],
  );

  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<DraftShape>;
      setStep(draft.step === 2 ? 2 : 1);
      setName(draft.name ?? "");
      setPrice(draft.price ?? "");
      setDescription(draft.description ?? "");
      setCategoryId(draft.categoryId ?? null);
      setAddress(draft.address ?? "");
      setPhoneNumber(draft.phoneNumber ?? "");
      setItemDetails(draft.itemDetails ?? {});
    } catch {
      // ignore malformed draft
    }
  }, [isOpen]);

  useEffect(() => {
    if (!dynamicFields.length) return;
    setItemDetails((current) => {
      const next = { ...current };
      for (const field of dynamicFields) {
        if (!(field.key in next)) {
          next[field.key] = field.type === "boolean" ? false : "";
        }
      }
      return next;
    });
  }, [dynamicFields]);

  useEffect(
    () => () => {
      for (const preview of reviewImagePreviews) {
        URL.revokeObjectURL(preview.url);
      }
    },
    [reviewImagePreviews],
  );

  const isStepOneValid = useMemo(() => {
    const phoneValid = isValidEthiopianPhoneInput(phoneNumber.trim());
    const hasBasics =
      name.trim().length > 0 &&
      description.trim().length > 0 &&
      price.trim().length > 0 &&
      categoryId !== null &&
      address.trim().length > 0 &&
      phoneValid;
    const dynamicValid = dynamicFields.every((field) => {
      if (!field.required) return true;
      const value = itemDetails[field.key];
      if (field.type === "boolean") return typeof value === "boolean";
      return String(value ?? "").trim().length > 0;
    });
    return hasBasics && dynamicValid;
  }, [
    address,
    categoryId,
    description,
    dynamicFields,
    itemDetails,
    name,
    phoneNumber,
    price,
  ]);

  const createAdMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("price", price.trim());
      formData.append("description", description.trim());
      formData.append("address", address.trim());
      formData.append("phoneNumber", phoneNumber.trim());
      formData.append("itemDetails", JSON.stringify(itemDetails));
      if (categoryId) {
        formData.append("categoryId", categoryId);
      }
      for (const file of imageSelection.newFiles.slice(0, 5)) {
        formData.append("images", file);
      }
      const response = await api.post<Ad>("/ads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
  });

  const persistDraft = () => {
    const draft: DraftShape = {
      step,
      name,
      price,
      description,
      categoryId,
      address,
      phoneNumber,
      itemDetails,
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  };

  const clearDraftAndForm = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setStep(1);
    setName("");
    setPrice("");
    setDescription("");
    setCategoryId(null);
    setAddress("");
    setPhoneNumber("");
    setItemDetails({});
    setImageSelection({
      newFiles: [],
      filledSlotsCount: 0,
    });
  };

  const handleNext = () => {
    if (!isStepOneValid || !hasAtLeastOneImage) return;
    setStep(2);
  };

  const hasAtLeastOneImage =
    imageSelection.filledSlotsCount > 0 || imageSelection.newFiles.length > 0;

  const handleSubmit = async () => {
    if (!hasAtLeastOneImage) {
      addToast({
        title: t("merchantPostAd.toast.imageRequired.title"),
        description: t("merchantPostAd.toast.imageRequired.description"),
        color: "warning",
      });
      return;
    }

    if (!isLoggedIn) {
      persistDraft();
      addToast({
        title: t("merchantPostAd.toast.loginRequired.title"),
        description: t("merchantPostAd.toast.loginRequired.description"),
        color: "warning",
      });
      requireLogin(getCurrentPathWithUpdatedQueryParam("openPostAd", "1"));
      return;
    }

    try {
      const createdAd = await createAdMutation.mutateAsync();
      addToast({
        title: t("merchantPostAd.toast.submitted.title"),
        description: t("merchantPostAd.toast.submitted.description"),
        color: "success",
      });
      clearDraftAndForm();
      onClose();
      onPosted(createdAd);
    } catch (error) {
      addToast({
        title: t("merchantPostAd.toast.submissionFailed.title"),
        description: getApiErrorMessage(error),
        color: "danger",
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        persistDraft();
        onClose();
      }}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          {step === 1
            ? t("merchantPostAd.header.post")
            : t("merchantPostAd.header.review")}
        </ModalHeader>
        <ModalBody>
          {step === 1 ? (
            <div className="space-y-4">
              <Input
                label={t("merchantPostAd.fields.title")}
                placeholder={t("merchantPostAd.fields.titlePlaceholder")}
                value={name}
                onValueChange={setName}
                isRequired
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="number"
                  label={t("merchantPostAd.fields.price")}
                  value={price}
                  onValueChange={setPrice}
                  isRequired
                />
                <Select
                  label={t("merchantPostAd.fields.category")}
                  selectedKeys={categoryId ? new Set([categoryId]) : new Set([])}
                  onSelectionChange={(keys) => {
                    const selected =
                      keys === "all" ? undefined : Array.from(keys)[0];
                    setCategoryId(selected ? String(selected) : null);
                  }}
                >
                  {categories.map((category) => (
                    <SelectItem key={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={t("merchantPostAd.fields.phone")}
                  placeholder={t("merchantPostAd.fields.phonePlaceholder")}
                  value={phoneNumber}
                  onValueChange={setPhoneNumber}
                  isInvalid={Boolean(phoneNumberError)}
                  errorMessage={phoneNumberError ?? undefined}
                  isRequired
                />
                <Input
                  label={t("merchantPostAd.fields.address")}
                  placeholder={t("merchantPostAd.fields.addressPlaceholder")}
                  value={address}
                  onValueChange={setAddress}
                  isRequired
                />
              </div>
              {dynamicFields.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-default-200 p-3">
                  <p className="text-sm font-semibold">
                    {t("merchantPostAd.fields.categoryDetails")}
                  </p>
                  {dynamicFields.map((field) => {
                    const value = itemDetails[field.key];
                    if (field.type === "boolean") {
                      return (
                        <Checkbox
                          key={field.key}
                          isSelected={Boolean(value)}
                          onValueChange={(checked) =>
                            setItemDetails((current) => ({
                              ...current,
                              [field.key]: checked,
                            }))
                          }
                        >
                          {field.label}
                        </Checkbox>
                      );
                    }

                    if (field.type === "select") {
                      return (
                        <Select
                          key={field.key}
                          label={field.label}
                          isRequired={Boolean(field.required)}
                          selectedKeys={
                            String(value ?? "").trim()
                              ? new Set([String(value)])
                              : new Set([])
                          }
                          onSelectionChange={(keys) => {
                            const selected =
                              keys === "all" ? undefined : Array.from(keys)[0];
                            setItemDetails((current) => ({
                              ...current,
                              [field.key]: selected ? String(selected) : "",
                            }));
                          }}
                        >
                          {(field.options ?? []).map((option) => (
                            <SelectItem key={option}>{option}</SelectItem>
                          ))}
                        </Select>
                      );
                    }

                    return (
                      <Input
                        key={field.key}
                        type={field.type === "number" ? "number" : "text"}
                        label={field.label}
                        isRequired={Boolean(field.required)}
                        value={String(value ?? "")}
                        onValueChange={(nextValue) =>
                          setItemDetails((current) => ({
                            ...current,
                            [field.key]: nextValue,
                          }))
                        }
                      />
                    );
                  })}
                </div>
              ) : null}
              <Textarea
                label={t("merchantPostAd.fields.description")}
                placeholder={t("merchantPostAd.fields.descriptionPlaceholder")}
                value={description}
                onValueChange={setDescription}
                minRows={4}
                isRequired
              />
              <AdImageUploader onSelectionChange={setImageSelection} />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="overflow-hidden rounded-2xl border border-default-200">
                <div className="border-b border-default-200 bg-default-100/50 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-default-600">
                    {t("merchantPostAd.review.basicInfo")}
                  </p>
                </div>
                <div className="border-b border-default-200 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-default-500">
                    {t("merchantPostAd.fields.title")}
                  </p>
                  <p className="mt-1 font-semibold text-foreground">{name}</p>
                </div>
                <div className="grid border-b border-default-200 sm:grid-cols-2">
                  <div className="border-b border-default-200 px-4 py-3 sm:border-b-0 sm:border-r sm:border-default-200">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      {t("merchantPostAd.review.price")}
                    </p>
                    <p className="mt-1 text-foreground">{price} Birr</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      {t("merchantPostAd.fields.category")}
                    </p>
                    <p className="mt-1 text-foreground">{activeCategory?.name ?? "-"}</p>
                  </div>
                </div>
                <div className="grid border-b border-default-200 bg-default-100/35 sm:grid-cols-2">
                  <div className="border-b border-default-200 px-4 py-3 sm:border-b-0 sm:border-r sm:border-default-200">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      {t("merchantPostAd.review.phone")}
                    </p>
                    <p className="mt-1 text-foreground">{phoneNumber}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      {t("merchantPostAd.fields.address")}
                    </p>
                    <p className="mt-1 text-foreground">{address}</p>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-default-500">
                    {t("merchantPostAd.fields.description")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground">{description}</p>
                </div>
              </div>

              {reviewDynamicRows.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-default-200">
                  <div className="border-b border-default-200 bg-default-100/50 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-default-600">
                      {t("merchantPostAd.fields.categoryDetails")}
                  </p>
                </div>
                  <div className="divide-y divide-default-200">
                    {reviewDynamicRows.map((row, index) => (
                      <div
                        key={row.key}
                        className={`grid gap-2 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] ${index % 2 === 0 ? "bg-default-100/30" : ""}`}
                      >
                        <p className="text-[11px] uppercase tracking-wide text-default-500">
                          {row.label}
                        </p>
                        <p className="text-foreground">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-default-200">
                <div className="border-b border-default-200 bg-default-100/50 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-default-600">
                    {t("merchantPostAd.review.photos", {
                      count: imageSelection.filledSlotsCount,
                    })}
                  </p>
                </div>
                {reviewImagePreviews.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                    {reviewImagePreviews.map((preview, index) => (
                      <figure key={preview.id} className="space-y-2">
                        <img
                          src={preview.url}
                          alt={t("merchantPostAd.review.selectedImageAlt", {
                            index: index + 1,
                          })}
                          className="h-28 w-full rounded-xl border border-default-200 object-cover"
                        />
                        <figcaption className="truncate text-xs text-default-500">
                          {preview.name}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-3 text-default-500">
                    {t("merchantPostAd.review.noPhotos")}
                  </p>
                )}
              </div>

              {!isLoggedIn ? (
                <div className="rounded-xl border border-warning-300 bg-warning-50 p-3 text-warning-800">
                  {t("merchantPostAd.review.loginRequired")}
                </div>
              ) : null}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {step === 1 ? (
            <>
              <Button variant="light" onPress={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                color="primary"
                onPress={handleNext}
                isDisabled={!isStepOneValid || !hasAtLeastOneImage}
              >
                {t("merchantPostAd.actions.next")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="light" onPress={() => setStep(1)}>
                {t("common.back")}
              </Button>
              <Button
                color={hasAtLeastOneImage ? "primary" : "default"}
                onPress={handleSubmit}
                isLoading={createAdMutation.isPending}
                isDisabled={!hasAtLeastOneImage || createAdMutation.isPending}
                startContent={<SendHorizontal size={16} />}
              >
                {isLoggedIn
                  ? t("merchantPostAd.actions.submit")
                  : t("merchantPostAd.actions.loginTelegram")}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

