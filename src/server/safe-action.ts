import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";
import { AuthError, requireContext, requirePermission } from "@/lib/auth-helpers";
import type { Action, Resource } from "@/lib/rbac";

export class PublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

export const action = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof AuthError) return e.message;
    if (e instanceof PublicError) return e.message;
    if (process.env.NODE_ENV === "development") return e.message;
    console.error("Server action error:", e);
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

export const authedAction = action.use(async ({ next }) => {
  const ctx = await requireContext();
  return next({ ctx });
});

export async function authorize(action: Action, resource: Resource) {
  return await requirePermission(action, resource);
}
