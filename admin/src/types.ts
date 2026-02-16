import { API_URL } from "./lib/api";

export interface CategoryDynamicField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  required?: boolean;
  options?: string[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  thumbnailUrl?: string | null;
  dynamicFields?: CategoryDynamicField[] | null;
  productCount?: number;
}

export type AdStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Ad {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  isActive: boolean;
  status?: AdStatus;
  address?: string | null;
  phoneNumber?: string | null;
  itemDetails?: Record<string, unknown> | null;
  moderationNote?: string | null;
  approvedAt?: string | null;
  imageUrl?: string;
  imageUrls?: string[] | null;
  merchantId?: number | null;
  createdById?: number | null;
  createdBy?: {
    id: number;
    firstName?: string | null;
    loginUsername?: string | null;
    username?: string | null;
  } | null;
  category?: Category;
  createdAt: string;
}

export interface AdReview {
  id: number;
  adId: number;
  userId: number;
  rating: number;
  comment: string | null;
  isEdited: boolean;
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    displayName: string;
    username?: string | null;
    avatarUrl?: string | null;
    isReviewBlocked?: boolean;
  };
}

export interface AdReviewMeta {
  totalReviews: number;
  averageRating: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface MerchantStats {
  totalAds: number;
  pendingAds: number;
  approvedAds: number;
  rejectedAds: number;
  totalViews: number;
  uniqueViewers: number;
}

export interface MerchantSummary {
  id: number;
  firstName?: string | null;
  username?: string | null;
  loginUsername?: string | null;
  avatarUrl?: string | null;
  isBanned: boolean;
  isReviewBlocked: boolean;
  loyaltyPoints: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string | null;
  stats: MerchantStats;
}

export interface MerchantActivity {
  id: number;
  activityType: string;
  title: string;
  description?: string | null;
  pointsDelta: number;
  pointsBalanceAfter?: number | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  createdAt: string;
  actor?: {
    id: number;
    firstName?: string | null;
    loginUsername?: string | null;
    username?: string | null;
  } | null;
}

export interface MerchantDetailResponse {
  merchant: MerchantSummary;
  recentAds: Array<{
    id: number;
    name: string;
    status: AdStatus;
    price: number;
    createdAt: string;
    updatedAt: string;
  }>;
  loyaltyConfig: {
    pointsPerAdPost: number;
    pointsPerAdView: number;
  };
}

export interface VisitorSummaryBucket {
  visits: number;
  uniqueVisitors: number;
}

export interface VisitorSummaryResponse {
  range: {
    from: string;
    to: string;
  };
  includeBots: boolean;
  totals: VisitorSummaryBucket;
  byCountry: Array<
    VisitorSummaryBucket & {
      country: string;
    }
  >;
  byReferrer: Array<
    VisitorSummaryBucket & {
      referrer: string;
    }
  >;
  byDay: Array<
    VisitorSummaryBucket & {
      date: string;
    }
  >;
}

export interface VisitorEventRecord {
  id: number;
  createdAt: string;
  visitorId: string;
  eventType: "page_view" | "ad_preview" | "ad_click" | string;
  path: string;
  referrer: string | null;
  referrerHost: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  language: string | null;
  userAgent: string | null;
  adId: number | null;
  adName?: string | null;
  merchantId: number | null;
  deviceType?: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  metadata: Record<string, string | number | boolean | null> | null;
  isBot: boolean;
}

export interface VisitorEventsResponse {
  range: {
    from: string;
    to: string;
  };
  includeBots: boolean;
  filters: {
    eventType: string | null;
    q: string | null;
    merchantId?: number | null;
    adId?: number | null;
  };
  data: VisitorEventRecord[];
  meta: PaginationMeta;
}

export interface MerchantEngagementSummary {
  totalEvents: number;
  uniqueVisitors: number;
  productViews: number;
  productClicks: number;
  uniqueViewers: number;
  uniqueClickers: number;
  ctr: number;
  uniqueCtr: number;
}

export interface MerchantEngagementBaseResponse {
  range: {
    from: string;
    to: string;
  };
  includeBots: boolean;
  filters: {
    merchantId: number | null;
    adId: number | null;
  };
}

export interface MerchantEngagementOverviewResponse extends MerchantEngagementBaseResponse {
  totals: MerchantEngagementSummary;
  funnel: Array<{
    key: "views" | "clicks";
    label: string;
    count: number;
    uniqueVisitors: number;
    conversionFromPrevious: number;
  }>;
}

export interface MerchantEngagementTimelineResponse extends MerchantEngagementBaseResponse {
  timeline: Array<{
    date: string;
    views: number;
    clicks: number;
    uniqueVisitors: number;
  }>;
}

export interface MerchantEngagementTopProductsResponse
  extends MerchantEngagementBaseResponse {
  topProducts: Array<{
    adId: number;
    adName: string;
    merchantId: number | null;
    views: number;
    clicks: number;
    uniqueViewers: number;
    uniqueClickers: number;
    ctr: number;
  }>;
}

export interface MerchantEngagementSegmentsResponse extends MerchantEngagementBaseResponse {
  segments: {
    byEventType: Array<{
      eventType: string;
      events: number;
      uniqueVisitors: number;
    }>;
    byCountry: Array<{
      country: string;
      events: number;
      uniqueVisitors: number;
    }>;
    byReferrer: Array<{
      referrer: string;
      events: number;
      uniqueVisitors: number;
    }>;
    byDevice: Array<{
      device: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
      events: number;
      uniqueVisitors: number;
    }>;
    visitorLifecycle: {
      newVisitors: number;
      returningVisitors: number;
    };
  };
}

export interface MerchantEngagementDataQualityResponse
  extends MerchantEngagementBaseResponse {
  dataQuality: {
    missingAdContext: number;
    missingCountry: number;
    missingReferrer: number;
    botEvents: number;
    eventsWithSchemaVersion: number;
  };
}

export type MerchantEngagementResponse = MerchantEngagementOverviewResponse &
  MerchantEngagementTimelineResponse &
  MerchantEngagementTopProductsResponse &
  MerchantEngagementSegmentsResponse &
  MerchantEngagementDataQualityResponse;

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveApiOrigin(): string {
  const trimmedApiBase = String(API_URL).trim();
  if (!trimmedApiBase) {
    return typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  }

  if (/^https?:\/\//i.test(trimmedApiBase)) {
    return stripTrailingSlash(trimmedApiBase.replace(/\/v1\/?$/, ""));
  }

  if (typeof window !== "undefined") {
    return stripTrailingSlash(window.location.origin);
  }

  return "http://localhost:3000";
}

export function getImageUrl(path: string | null) {
  if (!path) return "https://via.placeholder.com/150";
  const normalizedPath = String(path).trim();
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  const origin = resolveApiOrigin();
  const withLeadingSlash = normalizedPath.startsWith("/")
    ? normalizedPath
    : `/${normalizedPath}`;
  return `${origin}${withLeadingSlash}`;
}

