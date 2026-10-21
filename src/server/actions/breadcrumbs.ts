"use server";

import { getActiveContext } from "@/lib/auth-helpers";
import { buildBreadcrumbs } from "@/lib/breadcrumbs";

/** Breadcrumb trail for the path the user just navigated to. */
export async function breadcrumbsFor(path: string) {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 300) return [];
  const ctx = await getActiveContext();
  if (!ctx) return [];
  return buildBreadcrumbs(path, ctx.organization.id);
}
