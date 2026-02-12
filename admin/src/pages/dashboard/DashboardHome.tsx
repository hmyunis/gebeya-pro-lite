import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Card,
  CardBody,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { ClockCountdown, CheckCircle, XCircle, MegaphoneSimple } from "@phosphor-icons/react";
import { api } from "../../lib/api";
import type { PaginatedResponse, Ad } from "../../types";

type AdsStats = {
  totalAds: number;
  pendingAds: number;
  approvedAds: number;
  rejectedAds: number;
};

export default function DashboardHome() {
  const statsQuery = useQuery({
    queryKey: ["ads", "stats"],
    queryFn: async () => (await api.get("/ads/dashboard-stats")).data as AdsStats,
    refetchInterval: 10_000,
  });

  const pendingAdsQuery = useQuery({
    queryKey: ["ads", "pending-preview"],
    queryFn: async () =>
      (
        await api.get("/ads/manage", {
          params: { status: "PENDING", page: 1, limit: 8 },
        })
      ).data as PaginatedResponse<Ad>,
    refetchInterval: 10_000,
  });

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading || pendingAdsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Ads"
          value={stats?.totalAds ?? 0}
          loading={isLoading}
          icon={<MegaphoneSimple className="h-5 w-5 text-primary" />}
          subtitle="All submitted ads"
        />
        <StatsCard
          title="Pending Review"
          value={stats?.pendingAds ?? 0}
          loading={isLoading}
          icon={<ClockCountdown className="h-5 w-5 text-warning" />}
          subtitle="Needs moderation"
        />
        <StatsCard
          title="Approved"
          value={stats?.approvedAds ?? 0}
          loading={isLoading}
          icon={<CheckCircle className="h-5 w-5 text-success" />}
          subtitle="Live ads"
        />
        <StatsCard
          title="Rejected"
          value={stats?.rejectedAds ?? 0}
          loading={isLoading}
          icon={<XCircle className="h-5 w-5 text-danger" />}
          subtitle="Rejected submissions"
        />
      </div>

      <Card>
        <CardBody className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-default-500">Pending Ads</p>
              <h3 className="text-lg font-semibold">Latest submissions</h3>
            </div>
            <Chip variant="flat" color="warning" size="sm">
              {stats?.pendingAds ?? 0} pending
            </Chip>
          </div>

          <Table aria-label="Pending ads" removeWrapper>
            <TableHeader>
              <TableColumn>TITLE</TableColumn>
              <TableColumn>CATEGORY</TableColumn>
              <TableColumn>PRICE</TableColumn>
              <TableColumn>CONTACT</TableColumn>
            </TableHeader>
            <TableBody
              items={pendingAdsQuery.data?.data ?? []}
              emptyContent={isLoading ? "Loading..." : "No pending ads"}
            >
              {(item: Ad) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{item.name}</span>
                      <span className="text-xs text-default-500">
                        #{item.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{item.category?.name ?? "-"}</TableCell>
                  <TableCell>{item.price} Birr</TableCell>
                  <TableCell>{item.phoneNumber ?? "-"}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  loading,
  icon,
  subtitle,
}: {
  title: string;
  value: number;
  loading: boolean;
  icon: ReactNode;
  subtitle: string;
}) {
  return (
    <Card className="border border-default-200 bg-content1">
      <CardBody className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-default-400">
            {title}
          </p>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-default-100">
            {icon}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20 rounded-lg" />
        ) : (
          <h4 className="text-2xl font-semibold tracking-tight">{value}</h4>
        )}
        <p className="text-xs text-default-500">{subtitle}</p>
      </CardBody>
    </Card>
  );
}

