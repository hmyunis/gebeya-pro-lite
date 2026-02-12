import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/features/i18n";

export function AdImageCarousel({
  images,
  adName,
}: {
  images: string[];
  adName: string;
}) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const canSlide = images.length > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [images]);

  useEffect(() => {
    if (!canSlide) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [canSlide, images.length]);

  const currentImage = useMemo(() => images[activeIndex] ?? null, [activeIndex, images]);

  if (!currentImage) {
    return <div className="theme-image-placeholder h-full w-full rounded-2xl" />;
  }

  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col gap-2 overflow-x-hidden">
      <div className="theme-image-placeholder relative min-h-0 flex-1 overflow-hidden rounded-2xl">
        <img
          src={currentImage}
          alt={t("product.imageAlt", { name: adName, index: activeIndex + 1 })}
          className="h-full w-full object-cover"
        />

        {canSlide ? (
          <>
            <button
              type="button"
              onClick={() =>
                setActiveIndex((current) =>
                  current === 0 ? images.length - 1 : current - 1,
                )
              }
              className="theme-chip-contrast absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition"
              aria-label={t("product.prevImage")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveIndex((current) => (current + 1) % images.length)
              }
              className="theme-chip-contrast absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 transition"
              aria-label={t("product.nextImage")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="w-full max-w-full overflow-x-auto pb-1">
          <div className="flex w-max max-w-full gap-2">
          {images.map((image, index) => (
            <button
              key={`ad-image-thumb-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={[
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition",
                index === activeIndex ? "border-primary" : "border-transparent",
              ].join(" ")}
              aria-label={t("product.previewImage", { index: index + 1 })}
            >
              <img
                src={image}
                alt={t("product.previewAlt", { name: adName, index: index + 1 })}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

