export type Ad = {
  id: number;
  name: string;
  slug?: string;
  price: number | string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  imageUrl?: string;
  imageUrls?: string[] | null;
  description?: string;
  category?: {
    id?: number;
    name?: string;
    thumbnailUrl?: string | null;
    dynamicFields?: Array<{
      key: string;
      label: string;
      type: "text" | "number" | "select" | "boolean";
      required?: boolean;
      options?: string[];
    }> | null;
  };
  address?: string | null;
  phoneNumber?: string | null;
  itemDetails?: Record<string, unknown> | null;
  moderationNote?: string | null;
  merchantId?: number | null;
  createdById?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Category = {
  id: number;
  name: string;
  thumbnailUrl?: string | null;
  dynamicFields?: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "select" | "boolean";
    required?: boolean;
    options?: string[];
  }> | null;
  productCount?: number;
};

export type PriceRange = {
  id: string;
  min: number;
  max: number;
  label?: string;
};

export type AdComment = {
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
  };
};

export type AdCommentMeta = {
  totalReviews: number;
  averageRating: number;
};

