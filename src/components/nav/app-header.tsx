import Link from "next/link";
import { Fragment } from "react";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import type { ActiveContext } from "@/lib/auth-helpers";
import { ChevronRight, LogOut } from "lucide-react";
import { isExternalRole } from "@/lib/rbac";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

type BreadcrumbSegment = { label: string; href?: string };

export function AppHeader({
  context,
  breadcrumbs,
}: {
  context: ActiveContext;
  breadcrumbs: BreadcrumbSegment[];
}) {
  const { user, organization, membership } = context;

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl md:px-5 print:hidden"
      style={{ paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}
    >
      <MobileNav externalDiligence={isExternalRole(membership.role)} />
      {/* Breadcrumb */}
      <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Breadcrumb">
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((crumb, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="max-w-[200px] truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="max-w-[240px] truncate text-sm font-medium text-foreground">
                  {crumb.label}
                </span>
              )}
            </Fragment>
          ))
        ) : (
          <span className="text-sm font-medium text-foreground">{organization.name}</span>
        )}
      </nav>

      {/* Right side actions */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center rounded-full border border-border bg-muted px-2 py-0.5 sm:flex">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {organization.name}
          </span>
          {membership.financeAccess && (
            <>
              <span className="mx-1 text-muted-foreground/40">·</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                finance
              </span>
            </>
          )}
        </span>
        <div className="hidden text-right sm:block">
          <div className="text-[12px] font-medium leading-tight text-foreground">
            {user.name ?? user.email}
          </div>
          {user.name && (
            <div className="text-[10px] leading-tight text-muted-foreground">{user.email}</div>
          )}
        </div>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <ThemeToggle />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="size-3.5" />
          </Button>
        </form>
      </div>
    </header>
  );
}
