// All routes under (app) require auth and DB — never statically render.
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildBreadcrumbs } from "@/lib/breadcrumbs";
import { AppHeader } from "@/components/nav/app-header";
import { AppMain } from "@/components/nav/app-main";
import { AppSidebar } from "@/components/nav/app-sidebar";
import { canCtx, getActiveContext } from "@/lib/auth-helpers";
import { isExternalRole } from "@/lib/rbac";

/**
 * Routes an external_diligence guest is allowed to see. Anything else
 * redirects them to /diligence so they don't even glimpse other sections
 * of the app exist.
 */
const EXTERNAL_DILIGENCE_ALLOWED_PREFIXES = ["/diligence", "/sign-in"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getActiveContext();
  if (!context) redirect("/sign-in");

  const canSeeFinance = canCtx("read", "finance", context);
  const externalDiligence = isExternalRole(context.membership.role);

  const h = await headers();
  const path = h.get("x-pathname") || h.get("x-invoke-path") || "";

  // Hard guard: external_diligence guests can ONLY see /diligence/*.
  if (externalDiligence) {
    if (
      path &&
      !EXTERNAL_DILIGENCE_ALLOWED_PREFIXES.some((p) => path.startsWith(p))
    ) {
      redirect("/diligence");
    }
  }

  const breadcrumbs = await buildBreadcrumbs(path, context.organization.id);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar
        canSeeFinance={canSeeFinance}
        externalDiligence={externalDiligence}
        user={{
          name: context.user.name,
          email: context.user.email,
          role: context.membership.role,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader context={context} breadcrumbs={breadcrumbs} path={path} />
        {/* Phones: the page itself scrolls (native iOS scrolling, collapsing
            toolbars, sticky headers); wide tables scroll inside their own
            wrappers. Desktop keeps main as the scroll container, except on
            field (discovery) pages which rely on position:sticky. */}
        <AppMain>
          {children}
        </AppMain>
      </div>
    </div>
  );
}
