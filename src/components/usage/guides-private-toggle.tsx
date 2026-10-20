"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** FR-5.1: "Keep my guides private". Server-side setting, independent of the usage-count switch. */
export function GuidesPrivateToggle() {
  const supabase = createClient();
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase.from("profiles").select("guides_private").eq("id", data.user.id).single();
      if (alive) setOn(Boolean(prof?.guides_private));
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function flip() {
    if (on === null) return;
    setSaving(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error: err } = await supabase.from("profiles").update({ guides_private: !on }).eq("id", data.user.id);
    if (err) setError("Could not save. Please try again.");
    else setOn(!on);
    setSaving(false);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm">Keep my guides private</p>
        <p className="text-sm text-muted-foreground">
          When on, guides you create are never shared with other people or shown in the public library.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <button
        type="button"
        onClick={flip}
        disabled={on === null || saving}
        role="switch"
        aria-checked={Boolean(on)}
        aria-label="Keep my guides private"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
