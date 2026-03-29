"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Trophy,
  Menu,
  User,
  Settings,
  LogOut,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME, GOACTO_SHORT } from "@/lib/constants";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Branding */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="size-4" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight text-foreground">
              {APP_NAME}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {GOACTO_SHORT}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={
                    isActive
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : ""
                  }
                >
                  <link.icon data-icon="inline-start" className="size-4" />
                  {link.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Right side: Avatar Dropdown + Mobile Menu */}
        <div className="flex items-center gap-2">
          {/* User Dropdown (desktop & mobile) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar size="sm">
                <AvatarImage src="" alt="User avatar" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-56"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="size-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="size-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="md:hidden" />
              }
            >
              <Menu className="size-5" />
              <span className="sr-only">Toggle menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Leaf className="size-3.5" />
                  </div>
                  <span>{APP_NAME}</span>
                </SheetTitle>
              </SheetHeader>
              <Separator />
              <nav className="flex flex-col gap-1 px-4">
                {navLinks.map((link) => {
                  const isActive = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        className={`w-full justify-start ${
                          isActive
                            ? "bg-primary/10 text-primary hover:bg-primary/15"
                            : ""
                        }`}
                      >
                        <link.icon
                          data-icon="inline-start"
                          className="size-4"
                        />
                        {link.label}
                      </Button>
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
