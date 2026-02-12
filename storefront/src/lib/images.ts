import { joinUrl } from "@/lib/url";

export function resolveImageUrl(
  imageBase: string,
  imagePath?: string | null
): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return joinUrl(imageBase, imagePath);
}

