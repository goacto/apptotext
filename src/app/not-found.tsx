import Link from "next/link";
import { Home, LayoutDashboard, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4">
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="items-center pb-2">
          {/* Branding */}
          <div className="mb-4">
            <span className="text-xl font-bold tracking-tight">
              App<span className="text-primary">To</span>Text
            </span>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              GOACTO Ecosystem
            </p>
          </div>

          {/* 404 Number */}
          <div className="flex items-center justify-center">
            <span className="text-8xl font-bold tracking-tighter text-muted-foreground/20 sm:text-9xl">
              404
            </span>
          </div>

          {/* Search Icon */}
          <div className="mx-auto -mt-4 mb-2 flex size-14 items-center justify-center rounded-full bg-muted">
            <Search className="size-7 text-muted-foreground" />
          </div>

          <CardTitle className="text-xl">Page Not Found</CardTitle>
          <CardDescription className="max-w-sm">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            If you believe this is a mistake, please check the URL or contact
            support.
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Link href="/dashboard">
            <Button className="gap-1.5">
              <LayoutDashboard className="size-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="gap-1.5">
              <Home className="size-4" />
              Go Home
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
