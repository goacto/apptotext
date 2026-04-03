export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Welcome header skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-muted sm:w-80" />
          <div className="h-4 w-72 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="size-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Quick convert card skeleton */}
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4">
        <div className="space-y-1 px-4 pb-2">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-9 flex-1 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-muted sm:w-40" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-muted sm:w-24" />
          </div>
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4"
          >
            <div className="flex items-center gap-3 px-4">
              <div
                className="flex size-10 animate-pulse items-center justify-center rounded-lg bg-muted"
                style={{ animationDelay: `${i * 100}ms` }}
              />
              <div className="space-y-1.5">
                <div
                  className="h-6 w-12 animate-pulse rounded bg-muted"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
                <div
                  className="h-3 w-20 animate-pulse rounded bg-muted"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent conversions skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-7 w-16 animate-pulse rounded-lg bg-muted" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4"
            >
              {/* Card header */}
              <div className="space-y-2 px-4 pb-2">
                <div
                  className="h-5 w-48 animate-pulse rounded bg-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
                <div
                  className="h-3 w-56 animate-pulse rounded bg-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              </div>
              {/* Card content */}
              <div className="space-y-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-6 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div
                        key={j}
                        className="h-5 w-10 animate-pulse rounded-full bg-muted"
                      />
                    ))}
                  </div>
                </div>
              </div>
              {/* Card footer */}
              <div className="mt-4 flex items-center justify-between border-t bg-muted/50 p-4">
                <div className="h-7 w-28 animate-pulse rounded-lg bg-muted/80" />
                <div className="h-7 w-16 animate-pulse rounded-lg bg-muted/80" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Growth banner skeleton */}
      <div className="overflow-hidden rounded-xl bg-primary/5 py-4">
        <div className="flex items-center gap-3 px-4">
          <div className="hidden size-10 animate-pulse rounded-full bg-primary/10 sm:block" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
