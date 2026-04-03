import Link from "next/link";
import { GOACTO_FULL, GOACTO_SHORT } from "@/lib/constants";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/changelog", label: "Changelog" },
  { href: "/coming-soon", label: "Coming Soon" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p className="text-sm font-medium text-foreground">
            {GOACTO_SHORT}
          </p>
          <p className="text-xs text-muted-foreground">
            We are {GOACTO_FULL}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {GOACTO_SHORT}. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
