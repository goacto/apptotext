export default function ConversionLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                {/* Back button skeleton */}
                <div className="size-7 animate-pulse rounded-lg bg-muted" />
                {/* Title skeleton */}
                <div className="h-7 w-72 animate-pulse rounded-lg bg-muted sm:w-96" />
              </div>
              {/* Metadata row skeleton */}
              <div className="flex items-center gap-3">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-px bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-px bg-muted" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Content area */}
          <div className="flex-1 min-w-0">
            {/* Tabs skeleton */}
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 flex-1 animate-pulse rounded-md bg-muted"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>

            {/* Level description skeleton */}
            <div className="mb-6 mt-4">
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </div>

            {/* Chapter cards skeleton */}
            <div className="space-y-8">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
                >
                  {/* Chapter header skeleton */}
                  <div className="space-y-2 px-4 py-4">
                    <div
                      className="h-5 w-60 animate-pulse rounded bg-muted"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  </div>
                  {/* Chapter content skeleton */}
                  <div className="space-y-3 px-4 pb-4">
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                    <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    {/* Key concepts skeleton */}
                    <div className="mt-4 border-t pt-4">
                      <div className="mb-3 h-3 w-24 animate-pulse rounded bg-muted" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <div
                            key={j}
                            className="h-6 w-20 animate-pulse rounded-full bg-muted"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar skeleton */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="sticky top-6 space-y-4">
              {/* Progress card skeleton */}
              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4">
                <div className="px-4 pb-2">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                </div>
                <div className="space-y-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
                  <div className="space-y-1.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between"
                      >
                        <div
                          className="h-3 w-24 animate-pulse rounded bg-muted"
                          style={{ animationDelay: `${i * 80}ms` }}
                        />
                        <div className="size-3.5 animate-pulse rounded bg-muted" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions card skeleton */}
              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4">
                <div className="px-4 pb-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="space-y-2 px-4">
                  <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
                  <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
                </div>
              </div>

              {/* Current level card skeleton */}
              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10 py-4">
                <div className="space-y-1 px-4 pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="px-4">
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
