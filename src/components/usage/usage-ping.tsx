"use client";

import { useEffect } from "react";
import { sendDailyPing } from "@/lib/goactoPing";

/** GOACTO anonymous daily usage count (REQ v0.3.1 §4.6). Renders nothing; skips on opt-out or GPC. */
export function UsagePing() {
  useEffect(() => {
    void sendDailyPing("apptotext", { storage: window.localStorage, fetch: window.fetch.bind(window) });
  }, []);
  return null;
}
