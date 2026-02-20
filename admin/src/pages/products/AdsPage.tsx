import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
  addToast,
  useDisclosure,
} from "@heroui/react";
import { type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import { getImageUrl } from "../../types";
import type {
  AdStatus,
  Category,
  CategoryDynamicField,
  PaginatedResponse,
  Ad,
  AdReview,
  AdReviewMeta,
} from "../../types";
import AdModal from "../../components/products/AdModal";
import { DataTable } from "../../components/table/DataTable";
import { DataTablePagination } from "../../components/table/DataTablePagination";

type StatusFilter = "ALL" | AdStatus;
type ReviewModerationTarget =
  | {
      action: "delete";
      adId: number;
      commentId: number;
      reviewerName: string;
    }
  | {
      action: "block";
      adId: number;
      commentId: number;
      reviewerName: string;
    }
  | {
      action: "unblock";
      adId: number;
      commentId: number;
      reviewerName: string;
    };

const statusItems: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const statusColorMap: Record<AdStatus, "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};
const MAX_REVIEW_STARS = 5;
const MAX_REVIEW_NESTING_DEPTH = 4;

type DynamicFieldType = CategoryDynamicField["type"];

type CategoryDynamicFieldDraft = {
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  optionsText: string;
  isKeyAuto: boolean;
};

const dynamicFieldTypeItems: Array<{ key: DynamicFieldType; label: string }> = [
  { key: "text", label: "Text" },
  { key: "number", label: "Number" },
  { key: "select", label: "Select" },
  { key: "boolean", label: "Yes/No" },
];

function createEmptyDynamicFieldDraft(): CategoryDynamicFieldDraft {
  return {
    key: "",
    label: "",
    type: "text",
    required: false,
    optionsText: "",
    isKeyAuto: true,
  };
}

function normalizeFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseFieldOptions(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureUniqueDynamicFieldKeys(fields: CategoryDynamicField[]): CategoryDynamicField[] {
  const usedKeys = new Set<string>();
  fields.forEach((field, index) => {
    const normalized = field.key.trim().toLowerCase();
    if (usedKeys.has(normalized)) {
      throw new Error(`Field ${index + 1}: key "${field.key}" is duplicated.`);
    }
    usedKeys.add(normalized);
  });
  return fields;
}

function generateUniqueDynamicFieldKey(
  baseValue: string,
  drafts: CategoryDynamicFieldDraft[],
  excludeIndex: number,
): string {
  const normalizedBase = normalizeFieldKey(baseValue) || "field";
  const usedKeys = new Set(
    drafts
      .map((draft, index) => (index === excludeIndex ? "" : draft.key.trim().toLowerCase()))
      .filter(Boolean),
  );

  if (!usedKeys.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (usedKeys.has(`${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }
  return `${normalizedBase}_${suffix}`;
}

function normalizeDynamicFieldEntry(
  entry: Record<string, unknown>,
  index: number,
): CategoryDynamicField {
  const key = String(entry.key ?? "").trim();
  const label = String(entry.label ?? "").trim();
  const type = String(entry.type ?? "").trim().toLowerCase() as DynamicFieldType;
  const required = Boolean(entry.required);
  const options = Array.isArray(entry.options)
    ? entry.options
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    : undefined;

  if (!key || !label) {
    throw new Error(`Field ${index + 1}: key and label are required.`);
  }

  if (!["text", "number", "select", "boolean"].includes(type)) {
    throw new Error(`Field ${index + 1}: invalid type "${String(entry.type ?? "")}".`);
  }

  if (type === "select" && (!options || options.length === 0)) {
    throw new Error(`Field ${index + 1}: select type requires at least one option.`);
  }

  return {
    key,
    label,
    type,
    required,
    options: type === "select" ? options : undefined,
  };
}

function parseDynamicFieldsJson(raw: string): Category["dynamicFields"] {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Dynamic fields must be a JSON array");
  }
  const normalized = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Field ${index + 1}: each field must be an object.`);
    }
    return normalizeDynamicFieldEntry(entry as Record<string, unknown>, index);
  });
  const deduped = ensureUniqueDynamicFieldKeys(normalized);
  return deduped.length > 0 ? deduped : null;
}

function parseDynamicFieldDrafts(
  drafts: CategoryDynamicFieldDraft[],
): Category["dynamicFields"] {
  const normalized = drafts
    .map((draft, index) => {
      const key = draft.key.trim();
      const label = draft.label.trim();
      const optionsText = draft.optionsText.trim();
      const isBlankDraft =
        !key && !label && !optionsText && draft.type === "text" && !draft.required;

      if (isBlankDraft) return null;

      return normalizeDynamicFieldEntry(
        {
          key,
          label,
          type: draft.type,
          required: draft.required,
          options: draft.type === "select" ? parseFieldOptions(draft.optionsText) : [],
        },
        index,
      );
    })
    .filter((entry): entry is CategoryDynamicField => Boolean(entry));

  const deduped = ensureUniqueDynamicFieldKeys(normalized);
  return deduped.length > 0 ? deduped : null;
}

function stringifyDynamicFields(fields: Category["dynamicFields"]): string {
  return fields && fields.length > 0 ? JSON.stringify(fields, null, 2) : "";
}

function dynamicFieldsToDrafts(
  fields: Category["dynamicFields"],
): CategoryDynamicFieldDraft[] {
  if (!fields || fields.length === 0) return [];
  return fields.map((field) => ({
    key: field.key ?? "",
    label: field.label ?? "",
    type: field.type,
    required: Boolean(field.required),
    optionsText: (field.options ?? []).join("\n"),
    isKeyAuto: false,
  }));
}

function flattenAdReviews(reviews: AdReview[]): AdReview[] {
  const flattened: AdReview[] = [];

  const walk = (items: AdReview[]) => {
    for (const item of items) {
      flattened.push(item);
      if (Array.isArray(item.replies) && item.replies.length > 0) {
        walk(item.replies);
      }
    }
  };

  walk(reviews);
  return flattened;
}

function humanizeItemDetailKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withSpaces) return "Detail";

  return withSpaces
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatItemDetailPrimitive(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }
  return "-";
}

export default function AdsPage() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [adsPage, setAdsPage] = useState(1);
  const [adsLimit, setAdsLimit] = useState(10);
  const [categoriesPage, setCategoriesPage] = useState(1);
  const [categoriesLimit, setCategoriesLimit] = useState(10);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDynamicFields, setCategoryDynamicFields] = useState("");
  const [categoryDynamicFieldsMode, setCategoryDynamicFieldsMode] = useState<
    "builder" | "json"
  >("builder");
  const [categoryDynamicFieldDrafts, setCategoryDynamicFieldDrafts] = useState<
    CategoryDynamicFieldDraft[]
  >([]);
  const [categoryThumbnail, setCategoryThumbnail] = useState<File | null>(null);
  const [categoryThumbnailPreviewUrl, setCategoryThumbnailPreviewUrl] = useState<
    string | null
  >(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "ad" | "category";
    id: number;
    name: string;
  } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Ad | null>(null);
  const [reviewModerationTarget, setReviewModerationTarget] =
    useState<ReviewModerationTarget | null>(null);

  const { data: me } = useQuery<{ role?: string }>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    staleTime: 30_000,
  });
  const isAdmin = me?.role === "admin";

  const { data: adsResponse, isLoading } = useQuery<PaginatedResponse<Ad>>({
    queryKey: ["ads", search, statusFilter, adsPage, adsLimit],
    queryFn: async () =>
      (
        await api.get("/ads/manage", {
          params: {
            q: search.trim() || undefined,
            status: statusFilter === "ALL" ? "ALL" : statusFilter,
            page: adsPage,
            limit: adsLimit,
          },
        })
      ).data,
  });

  const { data: categoriesResponse, isLoading: isLoadingCategories } = useQuery<
    PaginatedResponse<Category>
  >({
    queryKey: ["categories", categoriesPage, categoriesLimit],
    queryFn: async () =>
      (
        await api.get("/categories", {
          params: { page: categoriesPage, limit: categoriesLimit },
        })
      ).data,
  });
  const {
    data: reviewsResponse,
    isLoading: isLoadingReviews,
    error: reviewsError,
    refetch: refetchReviews,
  } = useQuery<{ data: AdReview[]; meta: AdReviewMeta }>({
    queryKey: ["ad-reviews", detailsTarget?.id],
    queryFn: async () => {
      if (!detailsTarget) {
        throw new Error("Missing selected ad");
      }
      return (await api.get(`/ads/${detailsTarget.id}/comments/manage`)).data;
    },
    enabled: isAdmin && Boolean(detailsTarget?.id),
  });

  useEffect(() => {
    setAdsPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!categoryThumbnail) {
      setCategoryThumbnailPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(categoryThumbnail);
    setCategoryThumbnailPreviewUrl(previewUrl);
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [categoryThumbnail]);

  const ads = adsResponse?.data ?? [];
  const adsMeta = adsResponse?.meta;
  const categories = categoriesResponse?.data ?? [];
  const categoriesMeta = categoriesResponse?.meta;
  const adsTotalPages = Math.max(1, adsMeta?.totalPages ?? 1);
  const categoriesTotalPages = Math.max(1, categoriesMeta?.totalPages ?? 1);
  const adsOffset = ((adsMeta?.page ?? 1) - 1) * (adsMeta?.limit ?? ads.length);
  const categoriesOffset =
    ((categoriesMeta?.page ?? 1) - 1) * (categoriesMeta?.limit ?? categories.length);
  const adReviews = reviewsResponse?.data ?? [];
  const adReviewsMeta = reviewsResponse?.meta;
  const flattenedAdReviews = useMemo(() => flattenAdReviews(adReviews), [adReviews]);
  const totalReviewComments = useMemo(
    () =>
      flattenedAdReviews.reduce((total, review) => {
        return total + ((review.comment?.trim() ?? "").length > 0 ? 1 : 0);
      }, 0),
    [flattenedAdReviews],
  );
  const detailEntries = useMemo(() => {
    const rawDetails = detailsTarget?.itemDetails;
    if (!rawDetails || typeof rawDetails !== "object" || Array.isArray(rawDetails)) {
      return [];
    }

    const labelByKey = new Map(
      (detailsTarget?.category?.dynamicFields ?? []).map((field) => [
        field.key.trim().toLowerCase(),
        field.label.trim(),
      ]),
    );

    return Object.entries(rawDetails)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        key,
        label: labelByKey.get(key.trim().toLowerCase()) || humanizeItemDetailKey(key),
        value,
      }));
  }, [detailsTarget]);

  const createOrUpdateCategoryMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      dynamicFieldsRaw,
      thumbnail,
    }: {
      id?: number;
      name: string;
      dynamicFieldsRaw: string;
      thumbnail?: File | null;
    }) => {
      const formData = new FormData();
      formData.append("name", name.trim());
      if (dynamicFieldsRaw.trim()) {
        formData.append("dynamicFields", dynamicFieldsRaw.trim());
      }
      if (thumbnail) {
        formData.append("thumbnail", thumbnail);
      }
      if (id) {
        return api.patch(`/categories/${id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return api.post("/categories", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      addToast({
        title: "Category saved",
        description: "Category and schema changes were saved.",
        color: "success",
      });
      setCategoryName("");
      setCategoryDynamicFields("");
      setCategoryDynamicFieldsMode("builder");
      setCategoryDynamicFieldDrafts([]);
      setCategoryThumbnail(null);
      setEditingCategory(null);
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to save category",
        color: "danger",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      addToast({
        title: "Category deleted",
        description: "The category has been removed.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to delete category",
        color: "danger",
      });
    },
  });

  const deleteAdMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/ads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
      addToast({
        title: "Ad deleted",
        description: "The ad has been removed.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to delete ad",
        color: "danger",
      });
    },
  });
  const deleteReviewMutation = useMutation({
    mutationFn: async ({
      adId,
      commentId,
    }: {
      adId: number;
      commentId: number;
    }) => api.delete(`/ads/${adId}/comments/${commentId}`),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["ad-reviews", variables.adId],
      });
      addToast({
        title: "Review deleted",
        description: "The review has been removed.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to delete review",
        color: "danger",
      });
    },
  });
  const blockReviewerMutation = useMutation({
    mutationFn: async ({
      adId,
      commentId,
    }: {
      adId: number;
      commentId: number;
    }) => api.post(`/ads/${adId}/comments/${commentId}/block-reviewer`),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["ad-reviews", variables.adId],
      });
      addToast({
        title: "Reviewer blocked",
        description: "This user can no longer submit reviews.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to block reviewer",
        color: "danger",
      });
    },
  });
  const unblockReviewerMutation = useMutation({
    mutationFn: async ({
      adId,
      commentId,
    }: {
      adId: number;
      commentId: number;
    }) => api.post(`/ads/${adId}/comments/${commentId}/unblock-reviewer`),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["ad-reviews", variables.adId],
      });
      addToast({
        title: "Reviewer unblocked",
        description: "This user can leave reviews again.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to unblock reviewer",
        color: "danger",
      });
    },
  });
  const isReviewModerationPending =
    deleteReviewMutation.isPending ||
    blockReviewerMutation.isPending ||
    unblockReviewerMutation.isPending;

  const moderateMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: number;
      action: "approve" | "reject";
    }) => api.post(`/ads/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ads"] });
      queryClient.invalidateQueries({ queryKey: ["ads", "stats"] });
      addToast({
        title: "Ad updated",
        description: "Moderation status has been updated.",
        color: "success",
      });
    },
    onError: (err: any) => {
      addToast({
        title: "Error",
        description: err.response?.data?.message || "Failed to update ad status",
        color: "danger",
      });
    },
  });

  const adColumns = useMemo<ColumnDef<Ad>[]>(
    () => [
      {
        header: "#",
        cell: ({ row }) => (
          <p className="text-sm text-default-500">{adsOffset + row.index + 1}</p>
        ),
      },
      {
        header: "AD",
        cell: ({ row }) => {
          const imagePath = row.original.imageUrls?.[0] ?? row.original.imageUrl ?? null;
          return (
            <div className="flex items-center gap-3">
              <Avatar src={getImageUrl(imagePath)} radius="lg" />
              <div>
                <p className="text-sm font-semibold">{row.original.name}</p>
                <p className="text-xs text-default-500">
                  {row.original.price} Birr
                </p>
              </div>
            </div>
          );
        },
      },
      {
        header: "CATEGORY",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.category?.thumbnailUrl ? (
              <Avatar
                src={getImageUrl(row.original.category.thumbnailUrl)}
                radius="sm"
                className="h-6 w-6"
              />
            ) : null}
            <span>{row.original.category?.name || "Uncategorized"}</span>
          </div>
        ),
      },
      {
        header: "CONTACT",
        cell: ({ row }) => (
          <div className="text-xs text-default-600">
            <p>{row.original.phoneNumber || "-"}</p>
            <p>{row.original.address || "-"}</p>
          </div>
        ),
      },
      {
        header: "STATUS",
        cell: ({ row }) => {
          const status = (row.original.status ?? "PENDING") as AdStatus;
          return (
            <Chip size="sm" variant="flat" color={statusColorMap[status]}>
              {status}
            </Chip>
          );
        },
      },
      {
        header: "ACTIONS",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="light"
              onPress={() => setDetailsTarget(row.original)}
            >
              Details
            </Button>
            {isAdmin ? (
              <>
                {row.original.status !== "APPROVED" ? (
                  <Button
                    size="sm"
                    color="success"
                    variant="flat"
                    onPress={() =>
                      moderateMutation.mutate({ id: row.original.id, action: "approve" })
                    }
                  >
                    Approve
                  </Button>
                ) : null}
                {row.original.status !== "REJECTED" ? (
                  <Button
                    size="sm"
                    color="warning"
                    variant="flat"
                    onPress={() =>
                      moderateMutation.mutate({ id: row.original.id, action: "reject" })
                    }
                  >
                    Reject
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              size="sm"
              color="danger"
              variant="light"
              onPress={() =>
                setDeleteTarget({
                  type: "ad",
                  id: row.original.id,
                  name: row.original.name,
                })
              }
              startContent={<Trash className="h-4 w-4" />}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [adsOffset, isAdmin, moderateMutation],
  );

  const categoryColumns = useMemo<ColumnDef<Category>[]>(
    () => [
      {
        header: "#",
        cell: ({ row }) => (
          <p className="text-sm text-default-500">{categoriesOffset + row.index + 1}</p>
        ),
      },
      {
        header: "CATEGORY",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar
              src={getImageUrl(row.original.thumbnailUrl ?? null)}
              radius="sm"
              className="h-8 w-8"
            />
            <div>
              <p className="text-sm font-semibold">{row.original.name}</p>
              <p className="text-xs text-default-500">{row.original.slug}</p>
            </div>
          </div>
        ),
      },
      {
        header: "DYNAMIC FIELDS",
        cell: ({ row }) => (
          <Chip size="sm" variant="flat" color="primary">
            {row.original.dynamicFields?.length ?? 0}
          </Chip>
        ),
      },
      {
        header: "ACTIONS",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="light"
              onPress={() => {
                const nextFields = row.original.dynamicFields ?? null;
                setEditingCategory(row.original);
                setCategoryName(row.original.name);
                setCategoryDynamicFields(stringifyDynamicFields(nextFields));
                setCategoryDynamicFieldDrafts(dynamicFieldsToDrafts(nextFields));
                setCategoryDynamicFieldsMode("builder");
                setCategoryThumbnail(null);
              }}
              startContent={<PencilSimple className="h-4 w-4" />}
            >
              Edit
            </Button>
            <Button
              size="sm"
              color="danger"
              variant="light"
              onPress={() =>
                setDeleteTarget({
                  type: "category",
                  id: row.original.id,
                  name: row.original.name,
                })
              }
              startContent={<Trash className="h-4 w-4" />}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [categoriesOffset],
  );

  const dynamicFieldsBuilderPreview = useMemo(() => {
    try {
      const parsed = parseDynamicFieldDrafts(categoryDynamicFieldDrafts);
      return stringifyDynamicFields(parsed);
    } catch {
      return null;
    }
  }, [categoryDynamicFieldDrafts]);

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDynamicFields("");
    setCategoryDynamicFieldsMode("builder");
    setCategoryDynamicFieldDrafts([]);
    setCategoryThumbnail(null);
  };

  const switchToJsonMode = () => {
    try {
      const parsed = parseDynamicFieldDrafts(categoryDynamicFieldDrafts);
      setCategoryDynamicFields(stringifyDynamicFields(parsed));
      setCategoryDynamicFieldsMode("json");
    } catch (error: any) {
      addToast({
        title: "Fix schema fields first",
        description: error?.message || "Please fix builder errors before using JSON mode.",
        color: "warning",
      });
    }
  };

  const switchToBuilderMode = () => {
    try {
      const parsed = parseDynamicFieldsJson(categoryDynamicFields);
      setCategoryDynamicFieldDrafts(dynamicFieldsToDrafts(parsed));
      setCategoryDynamicFieldsMode("builder");
    } catch (error: any) {
      addToast({
        title: "Invalid JSON schema",
        description: error?.message || "Please provide a valid JSON array.",
        color: "warning",
      });
    }
  };

  const addDynamicFieldDraft = () => {
    setCategoryDynamicFieldDrafts((current) => [
      ...current,
      createEmptyDynamicFieldDraft(),
    ]);
  };

  const handleDynamicFieldKeyChange = (index: number, value: string) => {
    setCategoryDynamicFieldDrafts((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              key: value,
              isKeyAuto: value.trim().length === 0,
            }
          : entry,
      ),
    );
  };

  const handleDynamicFieldLabelChange = (index: number, value: string) => {
    setCategoryDynamicFieldDrafts((current) =>
      current.map((entry, entryIndex, allEntries) => {
        if (entryIndex !== index) return entry;

        const shouldAutoGenerate = entry.isKeyAuto || !entry.key.trim();
        if (!shouldAutoGenerate) {
          return { ...entry, label: value };
        }

        const generatedKey = generateUniqueDynamicFieldKey(value, allEntries, index);
        return {
          ...entry,
          label: value,
          key: generatedKey,
          isKeyAuto: true,
        };
      }),
    );
  };

  const ensureDynamicFieldKey = (index: number) => {
    setCategoryDynamicFieldDrafts((current) =>
      current.map((entry, entryIndex, allEntries) => {
        if (entryIndex !== index) return entry;
        if (entry.key.trim()) return entry;
        return {
          ...entry,
          key: generateUniqueDynamicFieldKey(entry.label, allEntries, index),
          isKeyAuto: true,
        };
      }),
    );
  };

  const updateDynamicFieldDraft = (
    index: number,
    updater: (draft: CategoryDynamicFieldDraft) => CategoryDynamicFieldDraft,
  ) => {
    setCategoryDynamicFieldDrafts((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? updater(entry) : entry,
      ),
    );
  };

  const removeDynamicFieldDraft = (index: number) => {
    setCategoryDynamicFieldDrafts((current) =>
      current.filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const handleSaveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try {
      const normalizedFields =
        categoryDynamicFieldsMode === "builder"
          ? parseDynamicFieldDrafts(categoryDynamicFieldDrafts)
          : parseDynamicFieldsJson(categoryDynamicFields);
      const dynamicFieldsRaw = stringifyDynamicFields(normalizedFields);

      if (categoryDynamicFieldsMode === "json") {
        setCategoryDynamicFieldDrafts(dynamicFieldsToDrafts(normalizedFields));
      }

      await createOrUpdateCategoryMutation.mutateAsync({
        id: editingCategory?.id,
        name: categoryName,
        dynamicFieldsRaw,
        thumbnail: categoryThumbnail,
      });
    } catch (error: any) {
      addToast({
        title: "Invalid dynamic fields schema",
        description:
          error?.message ||
          "Please fix the dynamic fields before saving the category.",
        color: "warning",
      });
    }
  };

  const handleOpenCreate = () => {
    setSelectedAd(null);
    onOpen();
  };

  return (
    <div className="space-y-4">
      <Tabs aria-label="Ads" color="primary" variant="underlined">
        <Tab key="ads" title="Ads">
          <div className="space-y-4">
            <div className="rounded-xl bg-content1 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  isClearable
                  className="w-full sm:max-w-[45%]"
                  placeholder="Search ads..."
                  value={search}
                  onValueChange={setSearch}
                />
                <div className="flex w-full gap-2 sm:w-auto">
                  <Select
                    aria-label="Filter ads by status"
                    classNames={{
                      base: "!w-full sm:!min-w-[240px]",
                      trigger: "!w-full sm:!min-w-[240px]",
                      label: "!w-full",
                    }}
                    selectedKeys={new Set([statusFilter])}
                    onSelectionChange={(keys) => {
                      const selected =
                        keys === "all" ? undefined : Array.from(keys)[0];
                      const normalized = String(selected ?? "ALL").toUpperCase();
                      if (
                        normalized === "ALL" ||
                        normalized === "PENDING" ||
                        normalized === "APPROVED" ||
                        normalized === "REJECTED"
                      ) {
                        setStatusFilter(normalized as StatusFilter);
                      }
                    }}
                  >
                    {statusItems.map((entry) => (
                      <SelectItem key={entry.key}>{entry.label}</SelectItem>
                    ))}
                  </Select>
                  <Button
                    color="primary"
                    onPress={handleOpenCreate}
                    className="shrink-0 px-4 sm:px-5"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Post Ad</span>
                    </span>
                  </Button>
                </div>
              </div>
            </div>

            <DataTable columns={adColumns} data={ads} isLoading={isLoading} />
            <DataTablePagination
              pagination={{
                count: adsMeta?.total ?? 0,
                page: adsMeta?.page ?? adsPage,
                pageSize: adsMeta?.limit ?? adsLimit,
                totalPages: adsTotalPages,
              }}
              onPageChange={(page) => {
                const next = Math.min(Math.max(1, page), adsTotalPages);
                setAdsPage(next);
              }}
              onPageSizeChange={(size) => {
                setAdsLimit(size);
                setAdsPage(1);
              }}
            />
          </div>
        </Tab>

        {isAdmin ? (
          <Tab key="categories" title="Categories">
            <Card className="mb-4">
              <CardBody>
                <form onSubmit={handleSaveCategory} className="space-y-4">
                  <Input
                    label="Category Name"
                    placeholder="e.g. Smartphones"
                    value={categoryName}
                    onValueChange={setCategoryName}
                    isRequired
                  />
                  <Input
                    type="file"
                    label="Thumbnail image"
                    accept="image/*"
                    onChange={(event) =>
                      setCategoryThumbnail(event.currentTarget.files?.[0] ?? null)
                    }
                  />
                  {categoryThumbnailPreviewUrl || editingCategory?.thumbnailUrl ? (
                    <div className="flex items-center gap-3 rounded-xl border border-default-200 p-2">
                      <img
                        src={
                          categoryThumbnailPreviewUrl ??
                          getImageUrl(editingCategory?.thumbnailUrl ?? null)
                        }
                        alt="Category thumbnail preview"
                        className="h-14 w-14 rounded-md object-cover"
                      />
                      <div className="text-xs text-default-600">
                        <p className="font-medium text-default-700">
                          {categoryThumbnail ? "Selected thumbnail" : "Current thumbnail"}
                        </p>
                        <p className="break-all">
                          {categoryThumbnail?.name ?? editingCategory?.thumbnailUrl}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-3 rounded-xl border border-default-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Dynamic fields schema</p>
                        <p className="text-xs text-default-500">
                          These fields appear on ad forms for this category.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          color={categoryDynamicFieldsMode === "builder" ? "primary" : "default"}
                          variant={
                            categoryDynamicFieldsMode === "builder" ? "solid" : "flat"
                          }
                          onPress={switchToBuilderMode}
                        >
                          Form Builder
                        </Button>
                        <Button
                          size="sm"
                          color={categoryDynamicFieldsMode === "json" ? "primary" : "default"}
                          variant={categoryDynamicFieldsMode === "json" ? "solid" : "flat"}
                          onPress={switchToJsonMode}
                        >
                          Advanced JSON
                        </Button>
                      </div>
                    </div>

                    {categoryDynamicFieldsMode === "builder" ? (
                      <div className="space-y-3">
                        {categoryDynamicFieldDrafts.length > 0 ? (
                          categoryDynamicFieldDrafts.map((fieldDraft, index) => (
                            <div
                              key={`dynamic-field-draft-${index}`}
                              className="space-y-3 rounded-xl border border-default-200 p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-default-500">
                                  Field {index + 1}
                                </p>
                                <Button
                                  size="sm"
                                  color="danger"
                                  variant="light"
                                  onPress={() => removeDynamicFieldDraft(index)}
                                  startContent={<Trash className="h-4 w-4" />}
                                >
                                  Remove
                                </Button>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <Input
                                  label="Key"
                                  placeholder="e.g. ram_size"
                                  value={fieldDraft.key}
                                  onValueChange={(value) => handleDynamicFieldKeyChange(index, value)}
                                  onBlur={() => ensureDynamicFieldKey(index)}
                                  description="Used in itemDetails payload"
                                />
                                <Input
                                  label="Label"
                                  placeholder="e.g. RAM Size"
                                  value={fieldDraft.label}
                                  onValueChange={(value) =>
                                    handleDynamicFieldLabelChange(index, value)
                                  }
                                  description={
                                    fieldDraft.isKeyAuto
                                      ? "Key is auto-generated and unique."
                                      : undefined
                                  }
                                />
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <Select
                                  label="Type"
                                  selectedKeys={new Set([fieldDraft.type])}
                                  onSelectionChange={(keys) => {
                                    const selected =
                                      keys === "all" ? undefined : Array.from(keys)[0];
                                    const normalized = String(selected ?? "text");
                                    if (
                                      normalized !== "text" &&
                                      normalized !== "number" &&
                                      normalized !== "select" &&
                                      normalized !== "boolean"
                                    ) {
                                      return;
                                    }
                                    updateDynamicFieldDraft(index, (current) => ({
                                      ...current,
                                      type: normalized,
                                      optionsText:
                                        normalized === "select"
                                          ? current.optionsText
                                          : "",
                                    }));
                                  }}
                                >
                                  {dynamicFieldTypeItems.map((item) => (
                                    <SelectItem key={item.key}>{item.label}</SelectItem>
                                  ))}
                                </Select>

                                <div className="flex items-end pb-2">
                                  <Checkbox
                                    isSelected={fieldDraft.required}
                                    onValueChange={(checked) =>
                                      updateDynamicFieldDraft(index, (current) => ({
                                        ...current,
                                        required: checked,
                                      }))
                                    }
                                  >
                                    Required
                                  </Checkbox>
                                </div>
                              </div>

                              {fieldDraft.type === "select" ? (
                                <Textarea
                                  label="Options"
                                  placeholder={"One per line or comma-separated"}
                                  value={fieldDraft.optionsText}
                                  onValueChange={(value) =>
                                    updateDynamicFieldDraft(index, (current) => ({
                                      ...current,
                                      optionsText: value,
                                    }))
                                  }
                                  minRows={2}
                                  description="Example: New, Used, Refurbished"
                                />
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <p className="rounded-lg border border-dashed border-default-300 px-3 py-4 text-sm text-default-500">
                            No dynamic fields yet. Add one to start.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            color="primary"
                            variant="flat"
                            onPress={addDynamicFieldDraft}
                            startContent={<Plus className="h-4 w-4" />}
                          >
                            Add field
                          </Button>
                          <Button
                            size="sm"
                            color="danger"
                            variant="light"
                            isDisabled={categoryDynamicFieldDrafts.length === 0}
                            onPress={() => setCategoryDynamicFieldDrafts([])}
                          >
                            Clear fields
                          </Button>
                        </div>

                        <Textarea
                          label="Generated JSON preview"
                          value={dynamicFieldsBuilderPreview ?? ""}
                          minRows={4}
                          isReadOnly
                          description="Use Advanced JSON mode to edit this directly."
                        />
                        {dynamicFieldsBuilderPreview === null ? (
                          <p className="text-xs text-danger">
                            Preview unavailable. Please fix invalid field values.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <Textarea
                        label="Dynamic fields schema (JSON array)"
                        placeholder='[{"key":"ram","label":"RAM","type":"text","required":true}]'
                        value={categoryDynamicFields}
                        onValueChange={setCategoryDynamicFields}
                        minRows={10}
                        description="Advanced mode: full JSON control."
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      type="submit"
                      isLoading={createOrUpdateCategoryMutation.isPending}
                    >
                      {editingCategory ? "Update Category" : "Add Category"}
                    </Button>
                    {editingCategory ? (
                      <Button
                        variant="flat"
                        onPress={resetCategoryForm}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardBody>
            </Card>

            <DataTable
              columns={categoryColumns}
              data={categories}
              isLoading={isLoadingCategories}
            />
            <DataTablePagination
              pagination={{
                count: categoriesMeta?.total ?? 0,
                page: categoriesMeta?.page ?? categoriesPage,
                pageSize: categoriesMeta?.limit ?? categoriesLimit,
                totalPages: categoriesTotalPages,
              }}
              onPageChange={(page) => {
                const next = Math.min(Math.max(1, page), categoriesTotalPages);
                setCategoriesPage(next);
              }}
              onPageSizeChange={(size) => {
                setCategoriesLimit(size);
                setCategoriesPage(1);
              }}
            />
          </Tab>
        ) : null}
      </Tabs>

      <AdModal
        isOpen={isOpen}
        onClose={() => {
          onClose();
          setSelectedAd(null);
        }}
        ad={selectedAd}
        isAdmin={isAdmin}
      />

      <Modal
        isOpen={Boolean(detailsTarget)}
        onClose={() => setDetailsTarget(null)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            {detailsTarget ? `Ad Details: "${detailsTarget.name}"` : "Ad Details"}
          </ModalHeader>
          <ModalBody className="space-y-4">
            {detailsTarget ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Status</p>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={statusColorMap[(detailsTarget.status ?? "PENDING") as AdStatus]}
                    >
                      {detailsTarget.status ?? "PENDING"}
                    </Chip>
                  </div>
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Price</p>
                    <p className="text-sm font-semibold">{detailsTarget.price} Birr</p>
                  </div>
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Category</p>
                    <p className="text-sm font-semibold">
                      {detailsTarget.category?.name || "Uncategorized"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Phone</p>
                    <p className="text-sm font-semibold">{detailsTarget.phoneNumber || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Address</p>
                    <p className="text-sm font-semibold">{detailsTarget.address || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="text-xs text-default-500">Created</p>
                    <p className="text-sm font-semibold">
                      {detailsTarget.createdAt
                        ? new Date(detailsTarget.createdAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-default-200 p-3">
                  <p className="mb-1 text-xs text-default-500">Description</p>
                  <p className="whitespace-pre-wrap text-sm text-default-700">
                    {detailsTarget.description || "-"}
                  </p>
                </div>

                {detailsTarget.moderationNote ? (
                  <div className="rounded-lg border border-default-200 p-3">
                    <p className="mb-1 text-xs text-default-500">Moderation Note</p>
                    <p className="whitespace-pre-wrap text-sm text-default-700">
                      {detailsTarget.moderationNote}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-lg border border-default-200 p-3">
                  <p className="mb-2 text-xs text-default-500">Images</p>
                  {(() => {
                    const imagePaths =
                      detailsTarget.imageUrls && detailsTarget.imageUrls.length > 0
                        ? detailsTarget.imageUrls
                        : detailsTarget.imageUrl
                          ? [detailsTarget.imageUrl]
                          : [];

                    if (imagePaths.length === 0) {
                      return <p className="text-sm text-default-500">No images.</p>;
                    }

                    return (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {imagePaths.map((path, index) => (
                          <img
                            key={`${detailsTarget.id}-image-${index}`}
                            src={getImageUrl(path)}
                            alt={`${detailsTarget.name} ${index + 1}`}
                            className="h-28 w-full rounded-md object-cover"
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-lg border border-default-200 p-3">
                  <p className="mb-2 text-xs text-default-500">Item Details</p>
                  {detailEntries.length === 0 ? (
                    <p className="text-sm text-default-500">No additional item details.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {detailEntries.map((entry) => {
                        const isArrayValue = Array.isArray(entry.value);
                        const isObjectValue =
                          typeof entry.value === "object" &&
                          entry.value !== null &&
                          !Array.isArray(entry.value);

                        const arrayValues: unknown[] = isArrayValue
                          ? (entry.value as unknown[])
                          : [];
                        const isSimpleArray = isArrayValue
                          ? arrayValues.every(
                              (item) =>
                                item === null ||
                                item === undefined ||
                                typeof item === "string" ||
                                typeof item === "number" ||
                                typeof item === "boolean",
                            )
                          : false;

                        return (
                          <div
                            key={`item-detail-${entry.key}`}
                            className="rounded-md border border-default-200 bg-default-50 p-2.5"
                          >
                            <p className="mb-1 text-xs font-medium text-default-500">
                              {entry.label}
                            </p>

                            {isSimpleArray ? (
                              <div className="flex flex-wrap gap-1.5">
                                {arrayValues.length > 0 ? (
                                  arrayValues.map((item: unknown, index: number) => (
                                    <Chip
                                      key={`${entry.key}-chip-${index}`}
                                      size="sm"
                                      variant="flat"
                                      color="default"
                                    >
                                      {formatItemDetailPrimitive(item)}
                                    </Chip>
                                  ))
                                ) : (
                                  <p className="text-sm text-default-700">-</p>
                                )}
                              </div>
                            ) : isObjectValue || isArrayValue ? (
                              <pre className="overflow-x-auto rounded-md bg-default-100 p-2 text-xs text-default-700">
                                {JSON.stringify(entry.value, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-sm text-default-700">
                                {formatItemDetailPrimitive(entry.value)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-default-200 p-3">
                  <p className="mb-2 text-xs text-default-500">Reviews & Comments</p>
                  {isLoadingReviews ? (
                    <p className="text-sm text-default-500">Loading feedback...</p>
                  ) : reviewsError ? (
                    <div className="space-y-2">
                      <p className="text-sm text-danger">
                        {(reviewsError as any)?.response?.data?.message ||
                          "Failed to load feedback"}
                      </p>
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => void refetchReviews()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-default-500">
                        {adReviewsMeta?.totalReviews ?? 0} rating
                        {(adReviewsMeta?.totalReviews ?? 0) === 1 ? "" : "s"} |{" "}
                        {totalReviewComments} comment
                        {totalReviewComments === 1 ? "" : "s"} | Average:{" "}
                        {(adReviewsMeta?.averageRating ?? 0).toFixed(1)} / 5
                      </p>
                      {flattenedAdReviews.length === 0 ? (
                        <p className="text-sm text-default-500">
                          No ratings or comments yet for this ad.
                        </p>
                      ) : (
                        flattenedAdReviews.map((review) => {
                          const createdAt = new Date(review.createdAt);
                          const createdAtLabel = Number.isNaN(createdAt.getTime())
                            ? review.createdAt
                            : createdAt.toLocaleString();
                          const reviewerUsername = review.user.username?.trim() ?? "";
                          const reviewerHandle = reviewerUsername
                            ? reviewerUsername.startsWith("@")
                              ? reviewerUsername
                              : `@${reviewerUsername}`
                            : null;
                          const ratingValue =
                            typeof review.rating === "number" && Number.isFinite(review.rating)
                              ? review.rating
                              : null;
                          const safeRating =
                            ratingValue === null
                              ? 0
                              : Math.max(
                                  1,
                                  Math.min(MAX_REVIEW_STARS, Math.round(ratingValue)),
                                );
                          const stars =
                            ratingValue === null
                              ? null
                              : "★".repeat(safeRating) +
                                "☆".repeat(MAX_REVIEW_STARS - safeRating);
                          const commentText = review.comment?.trim() ?? "";
                          const safeDepth = Math.max(
                            0,
                            Math.min(MAX_REVIEW_NESTING_DEPTH, review.depth ?? 0),
                          );
                          const leftIndent = safeDepth * 14;

                          return (
                            <Card
                              key={review.id}
                              className="border border-default-200 shadow-none"
                              style={{ marginLeft: `${leftIndent}px` }}
                            >
                              <CardBody className="space-y-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <Avatar
                                      src={getImageUrl(review.user.avatarUrl ?? null)}
                                      name={review.user.displayName}
                                      className="h-9 w-9 shrink-0"
                                      radius="full"
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold">
                                        {review.user.displayName}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-default-500">
                                        <span>{createdAtLabel}</span>
                                        <span>•</span>
                                        <span>User ID: {review.userId}</span>
                                        {reviewerHandle ? (
                                          <>
                                            <span>•</span>
                                            <span>{reviewerHandle}</span>
                                          </>
                                        ) : null}
                                      </div>
                                      <div className="mt-1">
                                        <Chip
                                          size="sm"
                                          variant="flat"
                                          color={review.user.isReviewBlocked ? "warning" : "success"}
                                        >
                                          {review.user.isReviewBlocked
                                            ? "Review access blocked"
                                            : "Review access active"}
                                        </Chip>
                                        {safeDepth > 0 ? (
                                          <Chip size="sm" variant="flat" color="secondary">
                                            Reply
                                          </Chip>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      color="danger"
                                      variant="light"
                                      onPress={() =>
                                        setReviewModerationTarget({
                                          action: "delete",
                                          adId: review.adId,
                                          commentId: review.id,
                                          reviewerName: review.user.displayName,
                                        })
                                      }
                                    >
                                      Delete
                                    </Button>
                                    <Button
                                      size="sm"
                                      color={review.user.isReviewBlocked ? "success" : "warning"}
                                      variant="flat"
                                      onPress={() =>
                                        setReviewModerationTarget({
                                          action: review.user.isReviewBlocked
                                            ? "unblock"
                                            : "block",
                                          adId: review.adId,
                                          commentId: review.id,
                                          reviewerName: review.user.displayName,
                                        })
                                      }
                                    >
                                      {review.user.isReviewBlocked
                                        ? "Unblock reviewer"
                                        : "Block reviewer"}
                                    </Button>
                                  </div>
                                </div>
                                {stars ? <p className="text-sm text-warning">{stars}</p> : null}
                                <p className="text-sm text-default-700">
                                  {commentText || (stars ? "Rating only" : "No text provided")}
                                </p>
                              </CardBody>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setDetailsTarget(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={Boolean(reviewModerationTarget)}
        onClose={() => setReviewModerationTarget(null)}
        size="md"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            {reviewModerationTarget?.action === "block"
              ? "Block Reviewer"
              : reviewModerationTarget?.action === "unblock"
                ? "Unblock Reviewer"
              : "Delete Review"}
          </ModalHeader>
          <ModalBody>
            {reviewModerationTarget?.action === "block" ? (
              <p>
                Prevent <strong>{reviewModerationTarget.reviewerName}</strong> from leaving any
                future reviews?
              </p>
            ) : reviewModerationTarget?.action === "unblock" ? (
              <p>
                Allow <strong>{reviewModerationTarget.reviewerName}</strong> to leave reviews
                again?
              </p>
            ) : reviewModerationTarget?.action === "delete" ? (
              <p>
                Delete this review by <strong>{reviewModerationTarget.reviewerName}</strong>?
              </p>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setReviewModerationTarget(null)}
              isDisabled={isReviewModerationPending}
            >
              Cancel
            </Button>
            <Button
              color={
                reviewModerationTarget?.action === "block"
                  ? "warning"
                  : reviewModerationTarget?.action === "unblock"
                    ? "success"
                    : "danger"
              }
              isLoading={isReviewModerationPending}
              onPress={() => {
                if (!reviewModerationTarget) return;

                if (reviewModerationTarget.action === "delete") {
                  deleteReviewMutation.mutate({
                    adId: reviewModerationTarget.adId,
                    commentId: reviewModerationTarget.commentId,
                  });
                } else if (reviewModerationTarget.action === "block") {
                  blockReviewerMutation.mutate({
                    adId: reviewModerationTarget.adId,
                    commentId: reviewModerationTarget.commentId,
                  });
                } else {
                  unblockReviewerMutation.mutate({
                    adId: reviewModerationTarget.adId,
                    commentId: reviewModerationTarget.commentId,
                  });
                }
                setReviewModerationTarget(null);
              }}
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="md">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">Confirm Delete</ModalHeader>
          <ModalBody>
            <p>
              {deleteTarget
                ? `Delete "${deleteTarget.name}" permanently?`
                : ""}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setDeleteTarget(null)}
              startContent={<X className="h-4 w-4" />}
            >
              Cancel
            </Button>
            <Button
              color="danger"
              onPress={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "ad") {
                  deleteAdMutation.mutate(deleteTarget.id);
                } else {
                  deleteCategoryMutation.mutate(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
              startContent={<Trash className="h-4 w-4" />}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}



