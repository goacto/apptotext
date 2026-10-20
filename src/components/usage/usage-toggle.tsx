"use client";

import { useState } from "react";
import { setUsageSharing, usageSharingOn } from "@/lib/goactoPing";

/** Settings row: "Share anonymous usage count" (on by default; off = no pings). */
export function UsageToggle() {
  // Settings renders client-side behind AuthGuard, so reading localStorage on first render is safe.
  const [on, setOn] = useState(() =>
    typeof window === "undefined" ? true : usageSharingOn({ storage: window.localStorage })
  );
  const flip = () => {
    setUsageSharing({ storage: window.localStorage }, !on);
    setOn(!on);
  };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Privacy</h3>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm">Share anonymous usage count</p>
          <p className="text-sm text-muted-foreground">
            One anonymous count per day. No account, page or IP is stored.
          </p>
        </div>
        <button
          type="button"
          onClick={flip}
          role="switch"
          aria-checked={on}
          aria-label="Share anonymous usage count"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
