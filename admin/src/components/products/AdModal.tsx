import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Checkbox,
  addToast,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type {
  Category,
  PaginatedResponse,
  Ad,
  AdStatus,
} from "../../types";
import { getImageUrl } from "../../types";
import AdImageUploader, {
  type ExistingAdImage,
  type AdImageSelection,
} from "./AdImageUploader";

const MAX_AD_IMAGES = 5;

interface AdModalProps {
  isOpen: boolean;
  onClose: () => void;
  ad?: Ad | null;
  isAdmin?: boolean;
}

export default function AdModal({
  isOpen,
  onClose,
  ad,
  isAdmin = false,
}: AdModalProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [existingImages, setExistingImages] = useState<ExistingAdImage[]>([]);
  const [imageSelection, setImageSelection] = useState<AdImageSelection>({
    retainedImagePaths: [],
    newFiles: [],
    filledSlotsCount: 0,
  });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState<AdStatus>("PENDING");
  const [itemDetails, setItemDetails] = useState<Record<string, string | boolean>>({});

  const { data: categoriesResponse } = useQuery<PaginatedResponse<Category>>({
    queryKey: ["categories", "select-options"],
    queryFn: async () =>
      (
        await api.get("/categories", {
          params: { page: 1, limit: 100 },
        })
      ).data,
  });

  const categories = categoriesResponse?.data ?? [];
  const activeCategory = useMemo(
    () =>
      categories.find((entry) => String(entry.id) === String(categoryId ?? "")) ??
      null,
    [categories, categoryId],
  );

  const actionLabel = ad ? "Update Ad" : "Create Ad";
  const headerLabel = ad ? "Edit Ad" : "Add New Ad";
  const mutationVerb = ad ? "updated" : "created";

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return api.post("/ads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!ad) return null;
      return api.patch(`/ads/${ad.id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
  });

  const mutation = ad ? updateMutation : createMutation;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("price", price.trim());
    formData.append("description", description);
    formData.append("address", address);
    formData.append("phoneNumber", phoneNumber);
    formData.append("itemDetails", JSON.stringify(itemDetails));
    if (categoryId) {
      formData.append("categoryId", categoryId);
    }
    if (isAdmin) {
      formData.append("status", status);
    }
    if (ad) {
      formData.append(
        "retainedImageUrls",
        JSON.stringify(imageSelection.retainedImagePaths),
      );
    }
    imageSelection.newFiles.forEach((file) => {
      formData.append("images", file);
    });

    try {
      await mutation.mutateAsync(formData);
      queryClient.invalidateQueries({ queryKey: ["ads"] });
      addToast({
        title: `Ad ${mutationVerb}`,
        description: `The ad has been ${mutationVerb} successfully.`,
        color: "success",
      });
      onClose();
      setImageSelection({
        retainedImagePaths: [],
        newFiles: [],
        filledSlotsCount: 0,
      });
    } catch (err: any) {
      addToast({
        title: "Error",
        description:
          err.response?.data?.message ||
          `Failed to ${ad ? "update" : "create"} ad`,
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const nextExistingImagePaths = ad
      ? ad.imageUrls?.length
        ? ad.imageUrls
        : ad.imageUrl
          ? [ad.imageUrl]
          : []
      : [];

    setExistingImages(
      nextExistingImagePaths.map((path) => ({
        path,
        url: getImageUrl(path),
      })),
    );
    setImageSelection({
      retainedImagePaths: nextExistingImagePaths,
      newFiles: [],
      filledSlotsCount: nextExistingImagePaths.length,
    });
    setName(ad?.name ?? "");
    setPrice(ad?.price !== undefined ? String(ad.price) : "");
    setCategoryId(ad?.category?.id ? String(ad.category.id) : null);
    setDescription(ad?.description ?? "");
    setAddress(ad?.address ?? "");
    setPhoneNumber(ad?.phoneNumber ?? "");
    setStatus(ad?.status ?? "PENDING");
    setItemDetails(
      ad?.itemDetails && typeof ad.itemDetails === "object"
        ? (ad.itemDetails as Record<string, string | boolean>)
        : {},
    );
  }, [isOpen, ad]);

  const dynamicFields = activeCategory?.dynamicFields ?? [];

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

  const isFormValid = useMemo(() => {
    const hasBasics = name.trim().length > 0 && price.trim().length > 0;
    const hasCategory = Boolean(categoryId);
    const hasRequiredImage = imageSelection.filledSlotsCount > 0;
    const hasValidCount = imageSelection.filledSlotsCount <= MAX_AD_IMAGES;
    const hasDynamicRequired = dynamicFields.every((field) => {
      if (!field.required) return true;
      const value = itemDetails[field.key];
      if (field.type === "boolean") return typeof value === "boolean";
      return String(value ?? "").trim().length > 0;
    });
    return hasBasics && hasCategory && hasRequiredImage && hasValidCount && hasDynamicRequired;
  }, [categoryId, dynamicFields, imageSelection.filledSlotsCount, itemDetails, name, price]);

  const requiredLabel = (label: string) => (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <span className="text-danger" aria-hidden="true">
        *
      </span>
    </span>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">{headerLabel}</ModalHeader>

        <ModalBody>
          <form id="ad-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="w-full shrink-0 md:w-60">
                <AdImageUploader
                  key={`${ad?.id ?? "new"}-${isOpen ? "open" : "closed"}`}
                  initialExistingImages={existingImages}
                  onSelectionChange={setImageSelection}
                />
              </div>

              <div className="flex flex-1 flex-col gap-4">
                <Input
                  label={requiredLabel("Ad title")}
                  required
                  value={name}
                  onValueChange={setName}
                  placeholder="e.g. iPhone 15 Pro Max"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    type="number"
                    label={requiredLabel("Price")}
                    required
                    endContent="Birr"
                    step="0.01"
                    value={price}
                    onValueChange={setPrice}
                  />
                  <Select
                    label={requiredLabel("Category")}
                    required
                    selectedKeys={categoryId ? new Set([categoryId]) : new Set([])}
                    onSelectionChange={(keys) => {
                      const selected =
                        keys === "all" ? undefined : Array.from(keys)[0];
                      setCategoryId(selected ? String(selected) : null);
                    }}
                  >
                    {categories.map((cat) => (
                      <SelectItem key={String(cat.id)} textValue={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Phone number"
                    placeholder="+251..."
                    value={phoneNumber}
                    onValueChange={setPhoneNumber}
                  />
                  <Input
                    label="Address"
                    placeholder="Bole, Addis Ababa"
                    value={address}
                    onValueChange={setAddress}
                  />
                </div>

                {dynamicFields.length > 0 ? (
                  <div className="grid gap-4 rounded-xl border border-default-200 p-4">
                    <p className="text-sm font-semibold">Category-specific details</p>
                    {dynamicFields.map((field) => {
                      const value = itemDetails[field.key];
                      const label = field.required ? requiredLabel(field.label) : field.label;

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
                            label={label}
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
                          label={label}
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

                {isAdmin ? (
                  <div className="grid gap-4 rounded-xl border border-default-200 p-4">
                    <Select
                      label="Ad status"
                      selectedKeys={new Set([status])}
                      onSelectionChange={(keys) => {
                        const selected =
                          keys === "all" ? undefined : Array.from(keys)[0];
                        const normalized = String(selected ?? "").toUpperCase();
                        if (
                          normalized === "PENDING" ||
                          normalized === "APPROVED" ||
                          normalized === "REJECTED"
                        ) {
                          setStatus(normalized);
                        }
                      }}
                    >
                      <SelectItem key="PENDING">Pending</SelectItem>
                      <SelectItem key="APPROVED">Approved</SelectItem>
                      <SelectItem key="REJECTED">Rejected</SelectItem>
                    </Select>
                  </div>
                ) : null}

                <Textarea
                  label="Description"
                  placeholder="Ad details..."
                  value={description}
                  onValueChange={setDescription}
                  minRows={3}
                />
              </div>
            </div>
          </form>
        </ModalBody>

        <ModalFooter>
          <Button
            color="danger"
            variant="light"
            onPress={onClose}
            startContent={<X className="h-4 w-4" />}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            type="submit"
            form="ad-form"
            isLoading={isLoading}
            isDisabled={!isFormValid || isLoading}
            startContent={<Check className="h-4 w-4" />}
          >
            {actionLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}


