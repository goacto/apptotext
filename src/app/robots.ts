import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/library/seo";

/** FR-6.5 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/library"],
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/conversion/",
        "/conversions",
        "/settings",
        "/profile",
        "/auth/",
        "/library/remove",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
