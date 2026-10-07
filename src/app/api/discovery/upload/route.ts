/**
 * POST /api/discovery/upload
 *
 * Issues short-lived Vercel Blob client tokens so the phone uploads
 * photos directly to Blob storage. Photo bytes never transit a serverless
 * function, which sidesteps the 4.5 MB request-body cap that breaks
 * full-resolution phone photos on the multipart route.
 *
 * The token is scoped to `discovery/<org>/<project>/` and image types
 * only; the client then registers the URL via registerDiscoveryPhoto.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryProjects } from "@/db/schema";
import { requireContext, requirePermission } from "@/lib/auth-helpers";
import { photoPathPrefix } from "@/lib/discovery/paths";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Photo storage isn't configured (BLOB_READ_WRITE_TOKEN missing)." },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const ctx = await requireContext();
    await requirePermission("update", "project");

    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { projectId } = JSON.parse(clientPayload ?? "{}") as { projectId?: string };
        if (!projectId) throw new Error("Missing project");
        const project = await db.query.discoveryProjects.findFirst({
          where: and(
            eq(discoveryProjects.id, projectId),
            eq(discoveryProjects.organizationId, ctx.organization.id),
          ),
          columns: { id: true },
        });
        if (!project) throw new Error("Project not found");
        if (!pathname.startsWith(photoPathPrefix(ctx.organization.id, project.id))) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
          maximumSizeInBytes: 30 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload not allowed";
    return Response.json({ error: message }, { status: 400 });
  }
}
