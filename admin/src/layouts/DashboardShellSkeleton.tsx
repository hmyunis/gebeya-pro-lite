import { Skeleton } from "@heroui/react";

export default function DashboardShellSkeleton() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 border-r border-default-200 bg-background px-4 py-6 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>

        <div className="flex flex-col gap-3 px-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={`sidebar-item-${index}`} className="h-10 w-full rounded-xl" />
          ))}
        </div>

        <div className="mt-auto px-2">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </aside>

      <main className="min-h-screen min-w-0 lg:ml-64">
        <header className="border-b border-default-200 bg-background/70 px-4 py-3 backdrop-blur-md md:px-6">
          <div className="flex h-10 items-center justify-between gap-4">
            <Skeleton className="h-7 w-44 rounded-lg" />
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
        </header>

        <div className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`summary-card-${index}`} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-120 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

