"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GuidePreview } from "@/components/guides/guide-preview";
import type { GuidePreview as Preview } from "@/lib/cache/preview";

/** The page HTML is static (ISR); signed-in state is resolved in the browser. */
export function LibraryPreview({ preview, returnTo }: { preview: Preview; returnTo: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(Boolean(data.user)))
      .catch(() => setSignedIn(false));
  }, []);
  return <GuidePreview preview={preview} returnTo={returnTo} signedIn={signedIn} />;
}
