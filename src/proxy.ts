import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { GONE_HTML, isLibraryGone, libraryRepoFromPath } from "@/lib/library/gone";

export async function proxy(request: NextRequest) {
  // FR-5.5: withdrawn / do-not-cache library pages answer 410 + noindex, live (not from the ISR cache).
  if (request.method === "GET" || request.method === "HEAD") {
    const lib = libraryRepoFromPath(request.nextUrl.pathname);
    if (lib && (await isLibraryGone(lib.repoKey, lib.level))) {
      return new NextResponse(request.method === "HEAD" ? null : GONE_HTML, {
        status: 410,
        headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" },
      });
    }
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
