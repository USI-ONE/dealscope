"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch, Settings, Users, UserCircle2, Building2, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  externalDiligenceVisible?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  {
    href: "/diligence",
    label: "Engagements",
    icon: FileSearch,
    externalDiligenceVisible: true,
  },
];

export const FIELD_NAV: NavItem[] = [
  { href: "/discovery", label: "Site discovery", icon: ClipboardCheck },
];

const SETTINGS_NAV: NavItem[] = [
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/account", label: "My account", icon: UserCircle2 },
  { href: "/settings/organization", label: "Organization", icon: Building2 },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150",
        active
          ? "bg-white/10 text-white font-medium"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.06]",
      )}
    >
      <item.icon
        className={cn("size-[15px] shrink-0 transition-opacity", active ? "opacity-100" : "opacity-60")}
      />
      {item.label}
    </Link>
  );
}

export function AppSidebar({
  externalDiligence,
  user,
}: {
  canSeeFinance: boolean;
  externalDiligence: boolean;
  user: { name: string | null; email: string; role: string };
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email[0]?.toUpperCase() ?? "?";

  const displayName = user.name ?? user.email;

  return (
    <aside className="hidden w-56 shrink-0 flex-col md:flex bg-[#111113] print:hidden">
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <Link href="/diligence" className="group flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500 shadow-sm">
            <svg viewBox="0 0 20 20" fill="white" className="size-4">
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293-2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L17 13.586V12a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white/90 transition-opacity group-hover:text-white">
            DealScope
          </span>
        </Link>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
          Diligence
        </p>
        <ul className="space-y-0.5">
          {PRIMARY_NAV.filter((i) => (externalDiligence ? !!i.externalDiligenceVisible : true)).map(
            (item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(item.href)} />
              </li>
            ),
          )}
        </ul>

        {!externalDiligence && (
          <div className="mt-6">
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Field
            </p>
            <ul className="space-y-0.5">
              {FIELD_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {!externalDiligence && (
          <div className="mt-6">
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Settings
            </p>
            <ul className="space-y-0.5">
              {SETTINGS_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* User card */}
      <div className="h-px bg-white/[0.06]" />
      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-white/10 text-[11px] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium leading-tight text-white/80">
              {displayName}
            </p>
            <p className="truncate text-[10px] leading-tight text-white/35 capitalize">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
          <Settings className="size-3.5 shrink-0 text-white/20 hover:text-white/50 transition-colors cursor-pointer" />
        </div>
      </div>
    </aside>
  );
}
