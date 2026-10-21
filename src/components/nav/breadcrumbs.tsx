"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { breadcrumbsFor } from "@/server/actions/breadcrumbs";

type Crumb = { label: string; href?: string };

/** Section crumb we can show instantly while names (walks, engagements) load. */
function sectionOnly(path: string): Crumb[] {
  if (path.startsWith("/discovery")) return [{ label: "Site discovery", href: "/discovery" }];
  if (path.startsWith("/diligence")) return [{ label: "Engagements", href: "/diligence" }];
  if (path.startsWith("/settings")) return [{ label: "Settings", href: "/settings/account" }];
  return [];
}

/**
 * The (app) layout renders once and isn't re-rendered on client navigation,
 * so the server's breadcrumbs only fit the first page. This follows the
 * live pathname and re-resolves the trail whenever it changes.
 */
export function Breadcrumbs({ initial, initialPath, fallback }: { initial: Crumb[]; initialPath: string; fallback: string }) {
  const path = usePathname();
  const cache = useRef(new Map<string, Crumb[]>([[initialPath, initial]]));
  const [crumbs, setCrumbs] = useState<Crumb[]>(() => (path === initialPath ? initial : sectionOnly(path)));

  useEffect(() => {
    const hit = cache.current.get(path);
    if (hit) return setCrumbs(hit);
    setCrumbs(sectionOnly(path));
    let live = true;
    void breadcrumbsFor(path).then((c) => {
      cache.current.set(path, c);
      if (live) setCrumbs(c);
    });
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Breadcrumb">
      {crumbs.length > 0 ? (
        crumbs.map((crumb, i) => (
          <Fragment key={`${i}-${crumb.label}`}>
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />}
            {crumb.href && i < crumbs.length - 1 ? (
              <Link
                href={crumb.href}
                className="max-w-[200px] truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="max-w-[240px] truncate text-sm font-medium text-foreground">{crumb.label}</span>
            )}
          </Fragment>
        ))
      ) : (
        <span className="text-sm font-medium text-foreground">{fallback}</span>
      )}
    </nav>
  );
}
