const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://apptotext.com";

/** FR-3.4 / FR-7.1: public copy says "we", never a person's name. */
export function removalAckEmail(repo: string, requestId: string, token: string) {
  const link = `${APP_URL}/library/remove?request=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;
  return {
    subject: `We received your request for ${repo}`,
    template: "removal_ack",
    text: [
      `We received your request for ${repo}. We'll confirm within 2 business days, or within 1 hour if you verify ownership below.`,
      "",
      "To verify ownership, do any one of these, then press \"Verify now\" on the request page:",
      `  1. Sign in to AppToText with the GitHub account that owns ${repo}.`,
      `  2. Add the topic "apptotext-optout" to ${repo}.`,
      `  3. Commit a file named .apptotext-optout to the default branch containing: ${token}`,
      "",
      `Request page: ${link}`,
      "",
      "— The AppToText team",
    ].join("\n"),
  };
}

export function removalDoneEmail(repo: string, neverCache: boolean) {
  return {
    subject: `We removed the guides for ${repo}`,
    template: "removal_done",
    text: [
      `We removed every saved guide for ${repo}. Its library pages now return "gone" and the shared content has been deleted.`,
      neverCache ? `We also added ${repo} to our do-not-cache list, so we won't save or list guides for it again.` : "",
      "",
      "— The AppToText team",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n"),
  };
}
