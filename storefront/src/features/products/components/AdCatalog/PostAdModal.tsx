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

import { api, getApiErrorMessage } from "@/lib/api";
import { requireLogin } from "@/features/auth/store/authStore";
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
    return "Use 09XXXXXXXX or +2519XXXXXXXX format.";
  }, [phoneNumber]);

  const activeCategory = useMemo(
    () =>
      categories.find((entry) => String(entry.id) === String(categoryId ?? "")) ??
      null,
    [categories, categoryId],
  );
  const dynamicFields = activeCategory?.dynamicFields ?? [];

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
    if (!isStepOneValid) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      persistDraft();
      addToast({
        title: "Telegram login required",
        description: "Sign in with Telegram to submit your ad.",
        color: "warning",
      });
      requireLogin(getCurrentPathWithUpdatedQueryParam("openPostAd", "1"));
      return;
    }

    try {
      const createdAd = await createAdMutation.mutateAsync();
      addToast({
        title: "Ad submitted",
        description: "Your ad is pending admin approval.",
        color: "success",
      });
      clearDraftAndForm();
      onClose();
      onPosted(createdAd);
    } catch (error) {
      addToast({
        title: "Submission failed",
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
          {step === 1 ? "Post an Ad" : "Review & Submit"}
        </ModalHeader>
        <ModalBody>
          {step === 1 ? (
            <div className="space-y-4">
              <Input
                label="Ad title"
                placeholder="e.g. iPhone 15 Pro"
                value={name}
                onValueChange={setName}
                isRequired
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="number"
                  label="Price (Birr)"
                  value={price}
                  onValueChange={setPrice}
                  isRequired
                />
                <Select
                  label="Category"
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
                  label="Phone number"
                  placeholder="09XXXXXXXX or +2519XXXXXXXX"
                  value={phoneNumber}
                  onValueChange={setPhoneNumber}
                  isInvalid={Boolean(phoneNumberError)}
                  errorMessage={phoneNumberError ?? undefined}
                  isRequired
                />
                <Input
                  label="Address"
                  placeholder="Bole, Addis Ababa"
                  value={address}
                  onValueChange={setAddress}
                  isRequired
                />
              </div>
              {dynamicFields.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-default-200 p-3">
                  <p className="text-sm font-semibold">Category details</p>
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
                label="Description"
                placeholder="Write ad details..."
                value={description}
                onValueChange={setDescription}
                minRows={4}
                isRequired
              />
              <AdImageUploader onSelectionChange={setImageSelection} />
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">{name}</p>
              <p>{description}</p>
              <p>Price: {price} Birr</p>
              <p>Category: {activeCategory?.name ?? "-"}</p>
              <p>Phone: {phoneNumber}</p>
              <p>Address: {address}</p>
              <p>Photos: {imageSelection.filledSlotsCount}</p>
              {!isLoggedIn ? (
                <div className="rounded-xl border border-warning-300 bg-warning-50 p-3 text-warning-800">
                  Telegram login is required to submit this ad.
                </div>
              ) : null}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {step === 1 ? (
            <>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="primary" onPress={handleNext} isDisabled={!isStepOneValid}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="light" onPress={() => setStep(1)}>
                Back
              </Button>
              <Button
                color="primary"
                onPress={handleSubmit}
                isLoading={createAdMutation.isPending}
              >
                {isLoggedIn ? "Submit Ad" : "Login with Telegram"}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

