"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardCheck, FileSearch, Menu, UserCircle2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/diligence", label: "Engagements", icon: FileSearch, external: true },
  { href: "/discovery", label: "Site discovery", icon: ClipboardCheck },
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/account", label: "My account", icon: UserCircle2 },
  { href: "/settings/organization", label: "Organization", icon: Building2 },
];

/** Phone-width navigation — the desktop sidebar is hidden below md. */
export function MobileNav({ externalDiligence }: { externalDiligence: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full active:bg-accent md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-label="Close menu" />
          <nav
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#111113] text-white"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex h-14 items-center justify-between px-4">
              <span className="text-[15px] font-semibold">DealScope</span>
              <button type="button" onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-full active:bg-white/10" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <ul className="space-y-1 px-3">
              {ITEMS.filter((i) => (externalDiligence ? i.external : true)).map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px]",
                        active ? "bg-white/10 font-medium text-white" : "text-white/70 active:bg-white/10",
                      )}
                    >
                      <item.icon className="size-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
