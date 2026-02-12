import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  addToast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";

import { useAuth } from "@/features/auth/hooks/useAuth";
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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["dashboard", "ads"] });
      addToast({
        title: "Ad deleted",
        description: "Your ad has been removed.",
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: "Delete failed",
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
            Home
          </Button>
          <Button
            color="primary"
            radius="full"
            size="sm"
            startContent={<Plus size={16} />}
            onPress={() => setIsPostModalOpen(true)}
          >
            Post Ad
          </Button>
        </div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-ink-muted">
          Merchant
        </p>
        <h1 className="font-display text-3xl leading-tight md:text-4xl">
          My Ads
        </h1>
        <p className="text-ink-muted text-sm">
          Track approval status and manage your posted ads.
        </p>
      </header>

      <Card className="theme-card-subtle">
        <CardBody className="space-y-4">
          <Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search your ads..."
            variant="bordered"
          />
          <Table aria-label="My ads" removeWrapper>
            <TableHeader>
              <TableColumn>TITLE</TableColumn>
              <TableColumn>CATEGORY</TableColumn>
              <TableColumn>PRICE</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>DATE</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody
              items={ads}
              emptyContent={adsQuery.isLoading ? "Loading..." : "No ads found"}
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
                      {ad.status ?? "PENDING"}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {ad.createdAt
                      ? new Date(ad.createdAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setPreviewAd(ad)}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={() => deleteMutation.mutate(ad.id)}
                        isLoading={deleteMutation.isPending}
                      >
                        Delete
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
    </section>
  );
}
