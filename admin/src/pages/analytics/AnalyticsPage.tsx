import { useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  DatePicker,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { CalendarDate, parseDate } from "@internationalized/date";
import {
  ArrowsClockwise,
  ChartBar,
  CursorClick,
  Eye,
  FunnelSimple,
  GlobeHemisphereWest,
  HardDrives,
  Info,
  ShieldWarning,
  UsersThree,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import { DataTable } from "../../components/table/DataTable";
import { DataTablePagination } from "../../components/table/DataTablePagination";
import type {
  Ad,
  MerchantEngagementDataQualityResponse,
  MerchantEngagementOverviewResponse,
  MerchantEngagementSegmentsResponse,
  MerchantEngagementTimelineResponse,
  MerchantEngagementTopProductsResponse,
  MerchantSummary,
  PaginatedResponse,
  VisitorEventRecord,
  VisitorEventsResponse,
} from "../../types";

type EventTypeFilter = "ALL" | "page_view" | "ad_preview" | "ad_click";

type AnalyticsFilters = {
  from: string;
  to: string;
  includeBots: boolean;
  merchantId: string;
  adId: string;
  eventType: EventTypeFilter;
  q: string;
};

type DetailHelpKey =
  | "occurredAt"
  | "visitorId"
  | "eventType"
  | "device"
  | "path"
  | "referrerHost"
  | "country"
  | "region"
  | "city"
  | "language"
  | "ad"
  | "merchantId"
  | "userAgent"
  | "metadata";

type EngagementSectionKey =
  | "timeline"
  | "topProducts"
  | "segments"
  | "dataQuality";

const DEVICE_COLORS: Record<
  "mobile" | "tablet" | "desktop" | "bot" | "unknown",
  string
> = {
  mobile: "#2563eb",
  tablet: "#22c55e",
  desktop: "#f97316",
  bot: "#dc2626",
  unknown: "#6b7280",
};

const DETAIL_HELP_CONTENT: Record<
  DetailHelpKey,
  { title: string; meaning: string; usage: string }
> = {
  occurredAt: {
    title: "Occurred At",
    meaning: "Server-recorded timestamp when this analytics event was stored.",
    usage: "Use this to order event timelines and correlate spikes with releases/campaigns.",
  },
  visitorId: {
    title: "Visitor ID",
    meaning: "Anonymous persistent identifier used to group a visitor's interactions.",
    usage: "Useful for unique visitor counts and repeat behavior analysis.",
  },
  eventType: {
    title: "Event Type",
    meaning: "Type of interaction captured (page view, ad preview, ad click).",
    usage: "Use this for funnel and conversion stage breakdowns.",
  },
  device: {
    title: "Device",
    meaning: "Derived client device classification from user-agent and bot flags.",
    usage: "Use this to see mobile/desktop behavior differences.",
  },
  path: {
    title: "Path",
    meaning: "URL path where the event was generated.",
    usage: "Useful for identifying which pages drive engagement.",
  },
  referrerHost: {
    title: "Referrer Host",
    meaning: "Source host that referred the user to the current page.",
    usage: "Use this for attribution and traffic source quality.",
  },
  country: {
    title: "Country",
    meaning: "Two-letter country code inferred from proxy headers.",
    usage: "Use this for geographic segmentation and market fit checks.",
  },
  region: {
    title: "Region",
    meaning: "Region/state-level location when available.",
    usage: "Supports finer geographic targeting and operational planning.",
  },
  city: {
    title: "City",
    meaning: "City-level location extracted from network headers.",
    usage: "Helpful for local campaigns and demand hotspots.",
  },
  language: {
    title: "Language",
    meaning: "Browser language preference at event time.",
    usage: "Use this to prioritize localization and content language.",
  },
  ad: {
    title: "Ad",
    meaning: "Resolved ad identity for ad-level engagement events.",
    usage: "Key for per-product performance and ranking.",
  },
  merchantId: {
    title: "Merchant ID",
    meaning: "Merchant owning the ad or interaction context.",
    usage: "Used for merchant-level dashboards and comparisons.",
  },
  userAgent: {
    title: "User Agent",
    meaning: "Raw browser/client signature sent by the request.",
    usage: "Useful for debugging odd traffic and validating device parsing.",
  },
  metadata: {
    title: "Metadata",
    meaning: "Extra event payload fields (adSlug, clickTarget, quality flags, etc.).",
    usage: "Use for custom diagnostics and schema-version checks.",
  },
};

function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toCalendarDate(value: string): CalendarDate | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  try {
    return parseDate(trimmed);
  } catch {
    return null;
  }
}

function getDefaultFilters(): AnalyticsFilters {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  return {
    from: formatDateInput(from),
    to: formatDateInput(to),
    includeBots: false,
    merchantId: "",
    adId: "",
    eventType: "ALL",
    q: "",
  };
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDateOnly(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatEventType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventTypeColor(value: string): "default" | "primary" | "secondary" | "success" {
  if (value === "page_view") return "primary";
  if (value === "ad_preview") return "secondary";
  if (value === "ad_click") return "success";
  return "default";
}

function parseErrorMessage(error: unknown, fallback: string): string {
  const maybeMessage = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (Array.isArray(maybeMessage)) {
    return maybeMessage.filter((item) => typeof item === "string").join(", ");
  }
  if (typeof maybeMessage === "string") return maybeMessage;
  return fallback;
}

export default function AnalyticsPage() {
  const [draftFilters, setDraftFilters] = useState<AnalyticsFilters>(() =>
    getDefaultFilters(),
  );
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(() =>
    getDefaultFilters(),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedEvent, setSelectedEvent] = useState<VisitorEventRecord | null>(
    null,
  );
  const [detailHelpTarget, setDetailHelpTarget] = useState<DetailHelpKey | null>(
    null,
  );
  const [requestedSections, setRequestedSections] = useState<
    Record<EngagementSectionKey, boolean>
  >({
    timeline: false,
    topProducts: false,
    segments: false,
    dataQuality: false,
  });

  const merchantId = parsePositiveInt(appliedFilters.merchantId);
  const adId = parsePositiveInt(appliedFilters.adId);
  const engagementParams = {
    from: appliedFilters.from,
    to: appliedFilters.to,
    includeBots: appliedFilters.includeBots ? "true" : undefined,
    merchantId: merchantId ?? undefined,
    adId: adId ?? undefined,
  };

  const merchantsQuery = useQuery<PaginatedResponse<MerchantSummary>>({
    queryKey: ["analytics", "merchant-options"],
    queryFn: async () =>
      (
        await api.get("/merchants", {
          params: { page: 1, limit: 100 },
        })
      ).data,
    staleTime: 5 * 60_000,
  });

  const adsQuery = useQuery<PaginatedResponse<Ad>>({
    queryKey: ["analytics", "ad-options", draftFilters.merchantId],
    queryFn: async () =>
      (
        await api.get("/ads/manage", {
          params: {
            scope: "merchant",
            merchantId: draftFilters.merchantId,
            page: 1,
            limit: 100,
            status: "ALL",
          },
        })
      ).data,
    enabled: Boolean(parsePositiveInt(draftFilters.merchantId)),
    staleTime: 2 * 60_000,
  });

  const overviewQuery = useQuery<MerchantEngagementOverviewResponse>({
    queryKey: [
      "analytics",
      "merchant-engagement-overview",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      merchantId,
      adId,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/merchants/engagement/overview", {
          params: engagementParams,
        })
      ).data,
  });

  const timelineQuery = useQuery<MerchantEngagementTimelineResponse>({
    queryKey: [
      "analytics",
      "merchant-engagement-timeline",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      merchantId,
      adId,
      requestedSections.timeline,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/merchants/engagement/timeline", {
          params: engagementParams,
        })
      ).data,
    enabled: requestedSections.timeline,
  });

  const topProductsQuery = useQuery<MerchantEngagementTopProductsResponse>({
    queryKey: [
      "analytics",
      "merchant-engagement-top-products",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      merchantId,
      adId,
      requestedSections.topProducts,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/merchants/engagement/top-products", {
          params: engagementParams,
        })
      ).data,
    enabled: requestedSections.topProducts,
  });

  const segmentsQuery = useQuery<MerchantEngagementSegmentsResponse>({
    queryKey: [
      "analytics",
      "merchant-engagement-segments",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      merchantId,
      adId,
      requestedSections.segments,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/merchants/engagement/segments", {
          params: engagementParams,
        })
      ).data,
    enabled: requestedSections.segments,
  });

  const dataQualityQuery = useQuery<MerchantEngagementDataQualityResponse>({
    queryKey: [
      "analytics",
      "merchant-engagement-data-quality",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      merchantId,
      adId,
      requestedSections.dataQuality,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/merchants/engagement/data-quality", {
          params: engagementParams,
        })
      ).data,
    enabled: requestedSections.dataQuality,
  });

  const eventsQuery = useQuery<VisitorEventsResponse>({
    queryKey: [
      "analytics",
      "events",
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.includeBots,
      appliedFilters.eventType,
      appliedFilters.q,
      merchantId,
      adId,
      page,
      pageSize,
    ],
    queryFn: async () =>
      (
        await api.get("/analytics/visitors/events", {
          params: {
            from: appliedFilters.from,
            to: appliedFilters.to,
            includeBots: appliedFilters.includeBots ? "true" : undefined,
            eventType:
              appliedFilters.eventType === "ALL"
                ? undefined
                : appliedFilters.eventType,
            q: appliedFilters.q.trim() || undefined,
            merchantId: merchantId ?? undefined,
            adId: adId ?? undefined,
            page,
            limit: pageSize,
          },
        })
      ).data,
  });

  const rowOffset =
    ((eventsQuery.data?.meta.page ?? page) - 1) *
    (eventsQuery.data?.meta.limit ?? pageSize);

  const eventColumns = useMemo<ColumnDef<VisitorEventRecord>[]>(
    () => [
      {
        header: "#",
        cell: ({ row }) => (
          <span className="text-xs text-default-500">{rowOffset + row.index + 1}</span>
        ),
      },
      {
        header: "WHEN",
        cell: ({ row }) => (
          <span className="text-xs text-default-700">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        header: "EVENT",
        cell: ({ row }) => (
          <Chip size="sm" variant="flat" color={eventTypeColor(row.original.eventType)}>
            {formatEventType(row.original.eventType)}
          </Chip>
        ),
      },
      {
        header: "PRODUCT",
        cell: ({ row }) => (
          <div className="space-y-1 text-xs">
            <p className="font-medium">{row.original.adName || "N/A"}</p>
            <p className="text-default-500">
              Ad #{row.original.adId ?? "-"} | Merchant #{row.original.merchantId ?? "-"}
            </p>
          </div>
        ),
      },
      {
        header: "DEVICE",
        cell: ({ row }) => (
          <Chip size="sm" variant="flat">
            {(row.original.deviceType ?? "unknown").toUpperCase()}
          </Chip>
        ),
      },
      {
        header: "PATH",
        cell: ({ row }) => (
          <p className="max-w-xs truncate text-xs text-default-600">{row.original.path}</p>
        ),
      },
      {
        header: "ACTIONS",
        cell: ({ row }) => (
          <Button size="sm" variant="flat" onPress={() => setSelectedEvent(row.original)}>
            Details
          </Button>
        ),
      },
    ],
    [rowOffset],
  );

  const overview = overviewQuery.data;
  const merchants = merchantsQuery.data?.data ?? [];
  const adOptions = adsQuery.data?.data ?? [];
  const deviceChartData = segmentsQuery.data?.segments.byDevice ?? [];
  const timelineChartData = timelineQuery.data?.timeline ?? [];
  const countryChartData = (segmentsQuery.data?.segments.byCountry ?? []).slice(0, 8);

  const requestSection = (section: EngagementSectionKey) => {
    setRequestedSections((prev) =>
      prev[section] ? prev : { ...prev, [section]: true },
    );
  };

  const normalizeFilters = (filters: AnalyticsFilters): AnalyticsFilters => {
    const fallback = getDefaultFilters();
    const merchantId = filters.merchantId.trim();
    return {
      ...filters,
      from: filters.from.trim() || fallback.from,
      to: filters.to.trim() || fallback.to,
      merchantId,
      adId: merchantId.length > 0 ? filters.adId.trim() : "",
      q: filters.q.trim(),
    };
  };

  const updateFilters = (updater: (prev: AnalyticsFilters) => AnalyticsFilters) => {
    setDraftFilters((prev) => {
      const next = normalizeFilters(updater(prev));
      setAppliedFilters(next);
      return next;
    });
    setPage(1);
  };

  const resetFilters = () => {
    const defaults = getDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setPage(1);
  };

  const isRefreshing =
    overviewQuery.isFetching ||
    eventsQuery.isFetching ||
    (requestedSections.timeline && timelineQuery.isFetching) ||
    (requestedSections.topProducts && topProductsQuery.isFetching) ||
    (requestedSections.segments && segmentsQuery.isFetching) ||
    (requestedSections.dataQuality && dataQualityQuery.isFetching);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merchant Analytics</h1>
          <p className="text-sm text-default-500">
            Merchant-level engagement funnel, product performance, segmentation, and
            data quality signals.
          </p>
        </div>
        <Button
          variant="flat"
          startContent={<ArrowsClockwise className="h-4 w-4" />}
          isLoading={isRefreshing}
          onPress={() => {
            const tasks: Array<Promise<unknown>> = [overviewQuery.refetch(), eventsQuery.refetch()];
            if (requestedSections.timeline) tasks.push(timelineQuery.refetch());
            if (requestedSections.topProducts) tasks.push(topProductsQuery.refetch());
            if (requestedSections.segments) tasks.push(segmentsQuery.refetch());
            if (requestedSections.dataQuality) tasks.push(dataQualityQuery.refetch());
            void Promise.all(tasks);
          }}
        >
          Refresh
        </Button>
      </div>

      <Card className="border border-default-200">
        <CardBody className="space-y-4 p-5 md:p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DatePicker
              label="From"
              value={toCalendarDate(draftFilters.from)}
              onChange={(value) =>
                updateFilters((prev) => ({
                  ...prev,
                  from: value ? value.toString() : "",
                }))
              }
            />
            <DatePicker
              label="To"
              value={toCalendarDate(draftFilters.to)}
              onChange={(value) =>
                updateFilters((prev) => ({
                  ...prev,
                  to: value ? value.toString() : "",
                }))
              }
            />
            <Select
              label="Merchant"
              selectedKeys={
                draftFilters.merchantId ? new Set([draftFilters.merchantId]) : new Set([])
              }
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                const merchantValue = typeof selected === "string" ? selected : "";
                updateFilters((prev) => ({
                  ...prev,
                  merchantId: merchantValue,
                  adId: "",
                }));
              }}
              isLoading={merchantsQuery.isLoading}
            >
              {merchants.map((merchant) => (
                <SelectItem key={String(merchant.id)}>
                  {(merchant.firstName?.trim() || "Unnamed merchant") +
                    ` (#${merchant.id})`}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Product"
              selectedKeys={draftFilters.adId ? new Set([draftFilters.adId]) : new Set([])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                updateFilters((prev) => ({
                  ...prev,
                  adId: typeof selected === "string" ? selected : "",
                }));
              }}
              isDisabled={!draftFilters.merchantId}
              isLoading={adsQuery.isLoading}
            >
              {adOptions.map((ad) => (
                <SelectItem key={String(ad.id)}>
                  {(ad.name || `Ad #${ad.id}`) + ` (#${ad.id})`}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Select
              label="Event Type (log)"
              selectedKeys={new Set([draftFilters.eventType])}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                if (typeof selected !== "string") return;
                updateFilters((prev) => ({
                  ...prev,
                  eventType: selected as EventTypeFilter,
                }));
              }}
            >
              <SelectItem key="ALL">All events</SelectItem>
              <SelectItem key="page_view">Page views</SelectItem>
              <SelectItem key="ad_preview">Ad previews</SelectItem>
              <SelectItem key="ad_click">Ad clicks</SelectItem>
            </Select>
            <Input
              label="Search Log"
              placeholder="Path, referrer, country, visitor..."
              value={draftFilters.q}
              onValueChange={(value) =>
                updateFilters((prev) => ({
                  ...prev,
                  q: value,
                }))
              }
            />
            <div className="flex items-end">
              <Checkbox
                isSelected={draftFilters.includeBots}
                onValueChange={(checked) =>
                  updateFilters((prev) => ({
                    ...prev,
                    includeBots: checked,
                  }))
                }
              >
                Include bot traffic
              </Checkbox>
            </div>
            <div className="flex items-end gap-2">
              <Button color="danger" variant="flat" onPress={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {overviewQuery.error ? (
        <p className="text-sm text-danger">
          {parseErrorMessage(overviewQuery.error, "Failed to load merchant analytics.")}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Events"
          value={String(overview?.totals.totalEvents ?? 0)}
          subtitle="Tracked events in range"
          icon={<ChartBar className="h-5 w-5 text-primary" />}
        />
        <KpiCard
          title="Unique Visitors"
          value={String(overview?.totals.uniqueVisitors ?? 0)}
          subtitle="Distinct visitor IDs"
          icon={<UsersThree className="h-5 w-5 text-secondary" />}
        />
        <KpiCard
          title="Product Views"
          value={String(overview?.totals.productViews ?? 0)}
          subtitle="ad_preview events"
          icon={<Eye className="h-5 w-5 text-success" />}
        />
        <KpiCard
          title="Contact Clicks"
          value={String(overview?.totals.productClicks ?? 0)}
          subtitle={`CTR ${(overview?.totals.ctr ?? 0).toFixed(2)}%`}
          icon={<CursorClick className="h-5 w-5 text-warning" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardBody className="space-y-3 p-5 md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Engagement Timeline</h2>
              <Chip size="sm" variant="flat">
                Views vs Clicks
              </Chip>
            </div>
            <div className="h-72">
              {!requestedSections.timeline ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-default-300">
                  <p className="text-sm text-default-500">
                    Timeline aggregation loads on demand.
                  </p>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => requestSection("timeline")}
                  >
                    Load Timeline
                  </Button>
                </div>
              ) : timelineQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : timelineQuery.error ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-danger">
                    {parseErrorMessage(timelineQuery.error, "Failed to load timeline data.")}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineChartData}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="clicksGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDateOnly} />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(label) => formatDateOnly(String(label))}
                      formatter={(value: number | string | undefined, name: string | undefined) => [
                        value ?? 0,
                        name ?? "value",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="#2563eb"
                      fill="url(#viewsGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      stroke="#f97316"
                      fill="url(#clicksGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardBody className="space-y-3 p-5 md:p-6">
            <h2 className="text-sm font-semibold">Funnel</h2>
            <div className="h-72">
              {overviewQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview?.funnel ?? []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="label" width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 4, 4]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <Divider />
            <div className="grid gap-2 sm:grid-cols-2">
              {(overview?.funnel ?? []).map((item) => (
                <div key={item.key} className="rounded-md border border-default-200 p-2.5">
                  <p className="text-xs text-default-500">{item.label}</p>
                  <p className="text-sm font-semibold">{item.count}</p>
                  <p className="text-xs text-default-500">
                    Conversion {item.conversionFromPrevious.toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardBody className="space-y-3 p-5 md:p-6">
            <h2 className="text-sm font-semibold">Device Mix</h2>
            <div className="h-64">
              {!requestedSections.segments ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-default-300">
                  <p className="text-sm text-default-500">Segmentation loads on demand.</p>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => requestSection("segments")}
                  >
                    Load Segmentation
                  </Button>
                </div>
              ) : segmentsQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : segmentsQuery.error ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-danger">
                    {parseErrorMessage(segmentsQuery.error, "Failed to load segmentation data.")}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deviceChartData}
                      dataKey="events"
                      nameKey="device"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {deviceChartData.map((entry) => (
                        <Cell
                          key={`device-${entry.device}`}
                          fill={DEVICE_COLORS[entry.device] ?? DEVICE_COLORS.unknown}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(segmentsQuery.data?.segments.byDevice ?? []).map((entry) => (
                <Chip key={entry.device} size="sm" variant="flat">
                  {entry.device.toUpperCase()}: {entry.events}
                </Chip>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3 p-5 md:p-6">
            <h2 className="text-sm font-semibold">Top Countries</h2>
            <div className="h-64">
              {!requestedSections.segments ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-default-300">
                  <p className="text-sm text-default-500">Segmentation loads on demand.</p>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => requestSection("segments")}
                  >
                    Load Segmentation
                  </Button>
                </div>
              ) : segmentsQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : segmentsQuery.error ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-danger">
                    {parseErrorMessage(segmentsQuery.error, "Failed to load segmentation data.")}
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="events" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3 p-5 md:p-6">
            <h2 className="text-sm font-semibold">Visitor Lifecycle</h2>
            {!requestedSections.segments ? (
              <div className="rounded-lg border border-dashed border-default-300 p-4">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-default-500">Lifecycle segmentation loads on demand.</p>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => requestSection("segments")}
                  >
                    Load Segmentation
                  </Button>
                </div>
              </div>
            ) : segmentsQuery.isLoading ? (
              <div className="flex min-h-24 items-center justify-center">
                <Spinner />
              </div>
            ) : segmentsQuery.error ? (
              <p className="text-sm text-danger">
                {parseErrorMessage(segmentsQuery.error, "Failed to load lifecycle data.")}
              </p>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-lg border border-default-200 p-3">
                  <p className="text-xs text-default-500">New Visitors</p>
                  <p className="text-xl font-semibold">
                    {segmentsQuery.data?.segments.visitorLifecycle.newVisitors ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-default-200 p-3">
                  <p className="text-xs text-default-500">Returning Visitors</p>
                  <p className="text-xl font-semibold">
                    {segmentsQuery.data?.segments.visitorLifecycle.returningVisitors ?? 0}
                  </p>
                </div>
              </div>
            )}
            <Divider />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-default-500">
              Data Quality
            </h3>
            {!requestedSections.dataQuality ? (
              <div className="rounded-lg border border-dashed border-default-300 p-4">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-default-500">Data quality checks load on demand.</p>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={() => requestSection("dataQuality")}
                  >
                    Load Data Quality
                  </Button>
                </div>
              </div>
            ) : dataQualityQuery.isLoading ? (
              <div className="flex min-h-24 items-center justify-center">
                <Spinner />
              </div>
            ) : dataQualityQuery.error ? (
              <p className="text-sm text-danger">
                {parseErrorMessage(dataQualityQuery.error, "Failed to load data quality.")}
              </p>
            ) : (
              <div className="grid gap-2">
                <QualityRow
                  icon={<ShieldWarning className="h-4 w-4 text-danger" />}
                  label="Missing ad context"
                  value={dataQualityQuery.data?.dataQuality.missingAdContext ?? 0}
                />
                <QualityRow
                  icon={<GlobeHemisphereWest className="h-4 w-4 text-warning" />}
                  label="Missing country"
                  value={dataQualityQuery.data?.dataQuality.missingCountry ?? 0}
                />
                <QualityRow
                  icon={<FunnelSimple className="h-4 w-4 text-warning" />}
                  label="Missing referrer"
                  value={dataQualityQuery.data?.dataQuality.missingReferrer ?? 0}
                />
                <QualityRow
                  icon={<HardDrives className="h-4 w-4 text-primary" />}
                  label="Schema-versioned events"
                  value={dataQualityQuery.data?.dataQuality.eventsWithSchemaVersion ?? 0}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-3 p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Top Products</h2>
            <Chip size="sm" variant="flat" color="secondary">
              {topProductsQuery.data?.topProducts.length ?? 0} products
            </Chip>
          </div>
          {!requestedSections.topProducts ? (
            <div className="rounded-lg border border-dashed border-default-300 p-6">
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-default-500">
                  Product engagement ranking runs on demand.
                </p>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={() => requestSection("topProducts")}
                >
                  Load Top Products
                </Button>
              </div>
            </div>
          ) : topProductsQuery.error ? (
            <p className="text-sm text-danger">
              {parseErrorMessage(topProductsQuery.error, "Failed to load top products.")}
            </p>
          ) : (
            <Table aria-label="Top product engagement">
              <TableHeader>
                <TableColumn>PRODUCT</TableColumn>
                <TableColumn>VIEWS</TableColumn>
                <TableColumn>CLICKS</TableColumn>
                <TableColumn>CTR</TableColumn>
                <TableColumn>UNIQUE</TableColumn>
              </TableHeader>
              <TableBody
                items={topProductsQuery.data?.topProducts ?? []}
                emptyContent={topProductsQuery.isLoading ? "Loading..." : "No product data"}
              >
                {(item) => (
                  <TableRow key={item.adId}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{item.adName}</p>
                        <p className="text-xs text-default-500">
                          Ad #{item.adId} | Merchant #{item.merchantId ?? "-"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{item.views}</TableCell>
                    <TableCell>{item.clicks}</TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={item.ctr >= 20 ? "success" : "default"}
                      >
                        {item.ctr.toFixed(2)}%
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-default-600">
                        <p>Viewers: {item.uniqueViewers}</p>
                        <p>Clickers: {item.uniqueClickers}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Event Log</h2>
        {eventsQuery.error ? (
          <p className="text-sm text-danger">
            {parseErrorMessage(eventsQuery.error, "Failed to load event log.")}
          </p>
        ) : null}
        <DataTable
          columns={eventColumns}
          data={eventsQuery.data?.data ?? []}
          isLoading={eventsQuery.isLoading}
        />
        <DataTablePagination
          pagination={{
            count: eventsQuery.data?.meta.total ?? 0,
            page: eventsQuery.data?.meta.page ?? page,
            pageSize: eventsQuery.data?.meta.limit ?? pageSize,
            totalPages: Math.max(1, eventsQuery.data?.meta.totalPages ?? 1),
          }}
          onPageChange={(nextPage) => setPage(Math.max(1, nextPage))}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
        />
      </div>

      <Modal
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>
            {selectedEvent
              ? `Event #${selectedEvent.id} - ${formatEventType(selectedEvent.eventType)}`
              : "Event details"}
          </ModalHeader>
          <ModalBody className="max-h-[72vh] overflow-y-auto py-2">
            {selectedEvent ? (
              <div className="grid gap-2 md:grid-cols-2">
                <DetailCard
                  label="Occurred At"
                  value={formatDateTime(selectedEvent.createdAt)}
                  onInfo={() => setDetailHelpTarget("occurredAt")}
                />
                <DetailCard
                  label="Visitor ID"
                  value={selectedEvent.visitorId}
                  mono
                  onInfo={() => setDetailHelpTarget("visitorId")}
                />
                <DetailCard
                  label="Event Type"
                  value={formatEventType(selectedEvent.eventType)}
                  onInfo={() => setDetailHelpTarget("eventType")}
                />
                <DetailCard
                  label="Device"
                  value={(selectedEvent.deviceType ?? "unknown").toUpperCase()}
                  onInfo={() => setDetailHelpTarget("device")}
                />
                <DetailCard
                  label="Path"
                  value={selectedEvent.path}
                  onInfo={() => setDetailHelpTarget("path")}
                />
                <DetailCard
                  label="Referrer Host"
                  value={selectedEvent.referrerHost || "direct"}
                  onInfo={() => setDetailHelpTarget("referrerHost")}
                />
                <DetailCard
                  label="Country"
                  value={selectedEvent.countryCode || "UNKNOWN"}
                  onInfo={() => setDetailHelpTarget("country")}
                />
                <DetailCard
                  label="Region"
                  value={selectedEvent.region || "-"}
                  onInfo={() => setDetailHelpTarget("region")}
                />
                <DetailCard
                  label="City"
                  value={selectedEvent.city || "-"}
                  onInfo={() => setDetailHelpTarget("city")}
                />
                <DetailCard
                  label="Language"
                  value={selectedEvent.language || "-"}
                  onInfo={() => setDetailHelpTarget("language")}
                />
                <DetailCard
                  label="Ad"
                  value={selectedEvent.adName || `#${selectedEvent.adId ?? "-"}`}
                  onInfo={() => setDetailHelpTarget("ad")}
                />
                <DetailCard
                  label="Merchant ID"
                  value={String(selectedEvent.merchantId ?? "-")}
                  onInfo={() => setDetailHelpTarget("merchantId")}
                />
                <div className="rounded-md border border-default-200 p-2 md:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      User Agent
                    </p>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="h-5 min-w-5"
                      onPress={() => setDetailHelpTarget("userAgent")}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="break-words text-xs leading-snug">
                    {selectedEvent.userAgent || "No user agent"}
                  </p>
                </div>
                <div className="rounded-md border border-default-200 p-2 md:col-span-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-default-500">
                      Metadata
                    </p>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="h-5 min-w-5"
                      onPress={() => setDetailHelpTarget("metadata")}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded-md bg-default-100 p-2 text-[11px] leading-tight">
                    {JSON.stringify(selectedEvent.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setSelectedEvent(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={Boolean(detailHelpTarget)} onClose={() => setDetailHelpTarget(null)} size="md">
        <ModalContent>
          <ModalHeader>{detailHelpTarget ? DETAIL_HELP_CONTENT[detailHelpTarget].title : "Field Info"}</ModalHeader>
          <ModalBody className="space-y-2">
            {detailHelpTarget ? (
              <>
                <div className="rounded-md border border-default-200 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-default-500">Meaning</p>
                  <p className="text-sm">{DETAIL_HELP_CONTENT[detailHelpTarget].meaning}</p>
                </div>
                <div className="rounded-md border border-default-200 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-default-500">How To Use</p>
                  <p className="text-sm">{DETAIL_HELP_CONTENT[detailHelpTarget].usage}</p>
                </div>
              </>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDetailHelpTarget(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <Card className="border border-default-200">
      <CardBody className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-default-500">{title}</p>
          {icon}
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-default-500">{subtitle}</p>
      </CardBody>
    </Card>
  );
}

function QualityRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-default-200 p-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-default-600">{label}</p>
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function DetailCard({
  label,
  value,
  mono = false,
  onInfo,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onInfo?: () => void;
}) {
  return (
    <div className="rounded-md border border-default-200 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-default-500">{label}</p>
        {onInfo ? (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="h-5 min-w-5"
            onPress={onInfo}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <p className={`break-words text-xs leading-snug ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
