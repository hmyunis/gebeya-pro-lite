import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  addToast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RotateCw } from "lucide-react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { formatLocaleDate, useI18n } from "@/features/i18n";
import { AdPreviewModal } from "@/features/products/components/AdCatalog/AdPreviewModal";
import { PostAdModal } from "@/features/products/components/AdCatalog/PostAdModal";
import type { Ad, Category } from "@/features/products/types";
import { api, getApiErrorMessage } from "@/lib/api";
import { API_BASE } from "@/config/env";
import { consumeQueryFlag } from "@/lib/navigation";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type DashboardAd = Ad;

type PaginatedResponse<T> = {
  data: T[];
  meta?: {
    total?: number;
  };
};

const statusColor: Record<
  NonNullable<DashboardAd["status"]>,
  "warning" | "success" | "danger"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [adPendingDelete, setAdPendingDelete] = useState<DashboardAd | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!consumeQueryFlag("openPostAd")) return;
    setIsPostModalOpen(true);
  }, []);

  const adsQuery = useQuery({
    queryKey: ["dashboard", "ads", debouncedSearch],
    queryFn: async () =>
      (
        await api.get("/ads/manage", {
          params: {
            page: 1,
            limit: 100,
            q: debouncedSearch.trim() || undefined,
            status: "ALL",
          },
        })
      ).data as PaginatedResponse<DashboardAd>,
  });

  const categoriesQuery = useQuery({
    queryKey: ["dashboard", "categories"],
    queryFn: async () =>
      (await api.get("/ads/filters")).data as { categories: Category[] },
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/ads/${id}`),
    onSuccess: () => {
      setAdPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "ads"] });
      addToast({
        title: t("merchantDashboard.toast.deleted.title"),
        description: t("merchantDashboard.toast.deleted.description"),
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: t("merchantDashboard.toast.deleteFailed.title"),
        description: getApiErrorMessage(error),
        color: "danger",
      });
    },
  });
  const visibilityMutation = useMutation({
    mutationFn: async ({
      id,
      isActive,
    }: {
      id: number;
      isActive: boolean;
    }) => api.patch(`/ads/${id}`, { isActive }),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "ads"] });
      addToast({
        title: variables.isActive
          ? t("merchantDashboard.toast.published.title")
          : t("merchantDashboard.toast.drafted.title"),
        description: variables.isActive
          ? t("merchantDashboard.toast.published.description")
          : t("merchantDashboard.toast.drafted.description"),
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: t("merchantDashboard.toast.visibilityFailed.title"),
        description: getApiErrorMessage(error),
        color: "danger",
      });
    },
  });

  const ads = useMemo(() => adsQuery.data?.data ?? [], [adsQuery.data]);
  const categories = useMemo(
    () => categoriesQuery.data?.categories ?? [],
    [categoriesQuery.data],
  );
  const deletingAdId = deleteMutation.isPending ? deleteMutation.variables : null;
  const togglingVisibilityAdId = visibilityMutation.isPending
    ? visibilityMutation.variables?.id
    : null;

  return (
    <section className="space-y-8">
      <header className="space-y-4 text-center">
        <div className="flex justify-between gap-2">
          <Button
            as="a"
            href="/"
            variant="flat"
            radius="full"
            size="sm"
            startContent={<ArrowLeft size={16} />}
          >
            {t("common.home")}
          </Button>
          <Button
            color="primary"
            radius="full"
            size="sm"
            startContent={<Plus size={16} />}
            onPress={() => setIsPostModalOpen(true)}
          >
            {t("common.postAd")}
          </Button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-ink-muted">
          {t("merchantDashboard.badge")}
        </p>
        <h1 className="font-display text-3xl leading-tight md:text-4xl">
          {t("merchantDashboard.title")}
        </h1>
        <p className="text-ink-muted text-sm">
          {t("merchantDashboard.subtitle")}
        </p>
      </header>

      <Card className="theme-card-subtle">
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onValueChange={setSearch}
              placeholder={t("merchantDashboard.searchPlaceholder")}
              variant="bordered"
            />
            <Button
              variant="flat"
              onPress={() => void adsQuery.refetch()}
              isDisabled={adsQuery.isFetching}
              startContent={
                <RotateCw
                  size={24}
                  className={adsQuery.isFetching ? "animate-spin" : ""}
                />
              }
            >
              {t("common.refresh")}
            </Button>
          </div>
          <Table aria-label={t("merchantDashboard.tableAria")} removeWrapper>
            <TableHeader>
              <TableColumn>{t("merchantDashboard.columns.title")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.category")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.price")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.status")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.visibility")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.date")}</TableColumn>
              <TableColumn>{t("merchantDashboard.columns.actions")}</TableColumn>
            </TableHeader>
            <TableBody
              items={ads}
              emptyContent={
                adsQuery.isLoading
                  ? t("common.loading")
                  : t("merchantDashboard.empty")
              }
            >
              {(ad: DashboardAd) => (
                <TableRow key={ad.id}>
                  <TableCell>{ad.name}</TableCell>
                  <TableCell>{ad.category?.name ?? "-"}</TableCell>
                  <TableCell>{ad.price} Birr</TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={statusColor[(ad.status ?? "PENDING") as NonNullable<DashboardAd["status"]>]}
                    >
                      {ad.status === "APPROVED"
                        ? t("merchantDashboard.status.approved")
                        : ad.status === "REJECTED"
                          ? t("merchantDashboard.status.rejected")
                          : t("merchantDashboard.status.pending")}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {(ad.status ?? "PENDING") === "APPROVED" ? (
                      <>
                        <Switch
                          size="sm"
                          isSelected={
                            togglingVisibilityAdId === ad.id
                              ? Boolean(visibilityMutation.variables?.isActive)
                              : ad.isActive !== false
                          }
                          isDisabled={
                            deleteMutation.isPending || visibilityMutation.isPending
                          }
                          onValueChange={(nextValue) =>
                            visibilityMutation.mutate({
                              id: ad.id,
                              isActive: nextValue,
                            })
                          }
                        >
                          {ad.isActive !== false
                            ? t("merchantDashboard.visibility.published")
                            : t("merchantDashboard.visibility.draft")}
                        </Switch>
                        {togglingVisibilityAdId === ad.id ? (
                          <p className="mt-1 text-xs text-ink-muted">
                            {t("merchantDashboard.updating")}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-ink-muted">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ad.createdAt
                      ? formatLocaleDate(new Date(ad.createdAt), locale, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setPreviewAd(ad)}
                      >
                        {t("product.preview")}
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={() => setAdPendingDelete(ad)}
                        isLoading={deletingAdId === ad.id}
                        isDisabled={deleteMutation.isPending}
                      >
                        {t("merchantDashboard.delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <AdPreviewModal
        isOpen={Boolean(previewAd)}
        onClose={() => setPreviewAd(null)}
        ad={previewAd}
        imageBase={API_BASE}
      />

      <PostAdModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        categories={categories}
        isLoggedIn={Boolean(user)}
        onPosted={(createdAd) => {
          queryClient.invalidateQueries({ queryKey: ["dashboard", "ads"] });
          if (createdAd) {
            setPreviewAd(createdAd);
          }
        }}
      />

      <Modal
        isOpen={Boolean(adPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setAdPendingDelete(null);
          }
        }}
        isDismissable={!deleteMutation.isPending}
        isKeyboardDismissDisabled={deleteMutation.isPending}
      >
        <ModalContent>
          <ModalHeader>{t("merchantDashboard.deleteDialog.title")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-ink-muted">
              {t("merchantDashboard.deleteDialog.description")}{" "}
              <span className="font-medium text-foreground">
                {adPendingDelete?.name ?? t("merchantDashboard.deleteDialog.fallback")}
              </span>
              . {t("merchantDashboard.deleteDialog.irreversible")}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => setAdPendingDelete(null)}
              isDisabled={deleteMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              onPress={() => {
                if (!adPendingDelete) return;
                deleteMutation.mutate(adPendingDelete.id);
              }}
              isLoading={deleteMutation.isPending}
            >
              {t("merchantDashboard.deleteDialog.confirm")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
