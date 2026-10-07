"use server";

/**
 * Network topology documentation from photos. The walker snaps (or
 * uploads) a controller screenshot, whiteboard, hand-drawn diagram or
 * marked-up floor plan; Claude vision turns it into a structured graph the
 * walker can correct, refine, and push into the walk's inventory.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  discoveryAnswers,
  discoveryPhotos,
  discoveryProjects,
  discoveryRecords,
  discoveryTopologies,
  type TopologyGraph,
  type TopologyNode,
} from "@/db/schema";
import {
  extractTopology,
  normalizeGraph,
  TOPOLOGY_MODEL,
  TOPOLOGY_SOURCE_KINDS,
  topologyGraphSchema,
  type TopologySourceKind,
} from "@/lib/discovery/topology-ai";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const sourceKind = z.enum(Object.keys(TOPOLOGY_SOURCE_KINDS) as [TopologySourceKind, ...TopologySourceKind[]]);

async function assertProject(projectId: string, organizationId: string) {
  const p = await db.query.discoveryProjects.findFirst({
    where: and(eq(discoveryProjects.id, projectId), eq(discoveryProjects.organizationId, organizationId)),
  });
  if (!p) throw new PublicError("Discovery project not found");
  return p;
}

async function assertTopology(topologyId: string, organizationId: string) {
  const t = await db.query.discoveryTopologies.findFirst({
    where: and(eq(discoveryTopologies.id, topologyId), eq(discoveryTopologies.organizationId, organizationId)),
  });
  if (!t) throw new PublicError("Topology not found");
  return t;
}

async function photoUrls(projectId: string, photoIds: string[]) {
  if (!photoIds.length) return [];
  const rows = await db
    .select({ id: discoveryPhotos.id, url: discoveryPhotos.url })
    .from(discoveryPhotos)
    .where(and(eq(discoveryPhotos.projectId, projectId), inArray(discoveryPhotos.id, photoIds)));
  const byId = new Map(rows.map((r) => [r.id, r.url]));
  return photoIds.map((id) => byId.get(id)).filter((u): u is string => !!u);
}

async function runExtraction(
  topologyId: string,
  input: Parameters<typeof extractTopology>[0],
) {
  try {
    const graph = await extractTopology(input);
    await db
      .update(discoveryTopologies)
      .set({ graph, status: "ready", error: null, model: TOPOLOGY_MODEL, updatedAt: new Date() })
      .where(eq(discoveryTopologies.id, topologyId));
    return graph;
  } catch (err) {
    const message = err instanceof PublicError ? err.message : "Extraction failed. Try again.";
    if (!(err instanceof PublicError)) console.error("topology extraction failed", err);
    await db
      .update(discoveryTopologies)
      .set({ status: input.previous ? "ready" : "error", error: message, updatedAt: new Date() })
      .where(eq(discoveryTopologies.id, topologyId));
    throw new PublicError(message);
  }
}

export const createTopologyFromPhotos = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      photoIds: z.array(z.string().uuid()).min(1).max(6),
      sourceKind,
      title: z.string().trim().min(1).max(200),
      hint: z.string().max(2_000).nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const urls = await photoUrls(p.id, parsedInput.photoIds);
    if (!urls.length) throw new PublicError("Photos haven't finished uploading yet");

    const [topo] = await db
      .insert(discoveryTopologies)
      .values({
        organizationId: ctx.organization.id,
        projectId: p.id,
        title: parsedInput.title,
        sourceKind: parsedInput.sourceKind,
        sourcePhotoIds: parsedInput.photoIds,
        status: "extracting",
        createdByMembershipId: ctx.membership.id,
      })
      .returning();

    await runExtraction(topo.id, {
      imageUrls: urls,
      sourceKind: parsedInput.sourceKind,
      hint: parsedInput.hint,
    });
    revalidatePath(`/discovery/${p.id}/topology`);
    return { topologyId: topo.id };
  });

export const refineTopology = authedAction
  .schema(z.object({ topologyId: z.string().uuid(), correction: z.string().trim().min(3).max(2_000) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const t = await assertTopology(parsedInput.topologyId, ctx.organization.id);
    const urls = await photoUrls(t.projectId, t.sourcePhotoIds);
    if (!urls.length) throw new PublicError("Source photos are gone — create a new topology");
    await runExtraction(t.id, {
      imageUrls: urls,
      sourceKind: t.sourceKind as TopologySourceKind,
      previous: t.graph,
      correction: parsedInput.correction,
    });
    revalidatePath(`/discovery/${t.projectId}/topology/${t.id}`);
    return { ok: true };
  });

export const retryTopology = authedAction
  .schema(z.object({ topologyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const t = await assertTopology(parsedInput.topologyId, ctx.organization.id);
    const urls = await photoUrls(t.projectId, t.sourcePhotoIds);
    if (!urls.length) throw new PublicError("Source photos are gone — create a new topology");
    await db.update(discoveryTopologies).set({ status: "extracting", error: null }).where(eq(discoveryTopologies.id, t.id));
    await runExtraction(t.id, { imageUrls: urls, sourceKind: t.sourceKind as TopologySourceKind });
    revalidatePath(`/discovery/${t.projectId}/topology/${t.id}`);
    return { ok: true };
  });

export const saveTopology = authedAction
  .schema(
    z.object({
      topologyId: z.string().uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      graph: topologyGraphSchema
        .extend({
          nodes: z.array(
            topologyGraphSchema.shape.nodes.element.extend({ recordId: z.string().uuid().nullable().optional() }),
          ),
          links: z.array(topologyGraphSchema.shape.links.element.extend({ id: z.string().optional() })),
        })
        .optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const t = await assertTopology(parsedInput.topologyId, ctx.organization.id);
    await db
      .update(discoveryTopologies)
      .set({
        title: parsedInput.title ?? t.title,
        graph: parsedInput.graph ? normalizeGraph(parsedInput.graph as TopologyGraph) : t.graph,
        updatedAt: new Date(),
      })
      .where(eq(discoveryTopologies.id, t.id));
    revalidatePath(`/discovery/${t.projectId}/topology/${t.id}`);
    return { ok: true };
  });

export const deleteTopology = authedAction
  .schema(z.object({ topologyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const t = await assertTopology(parsedInput.topologyId, ctx.organization.id);
    await db.delete(discoveryTopologies).where(eq(discoveryTopologies.id, t.id));
    revalidatePath(`/discovery/${t.projectId}/topology`);
    return { ok: true };
  });

/** Maps a topology node onto a checklist inventory table. */
function toRecord(n: TopologyNode): { tableKey: string; data: Record<string, string> } | null {
  const notes = [n.ip && `IP ${n.ip}`, n.mac && `MAC ${n.mac}`, n.notes, "From topology"].filter(Boolean).join(" · ");
  const s = (v: string | null | undefined) => v ?? "";
  switch (n.type) {
    case "switch":
      return { tableKey: "access_switches", data: { location: s(n.location) || n.label, make: s(n.make), model: s(n.model), notes } };
    case "ap":
      return { tableKey: "aps", data: { location: s(n.location) || n.label, make: s(n.make), model: s(n.model), notes } };
    case "server":
    case "nas":
      return {
        tableKey: "servers",
        data: {
          hostname: n.label,
          kind: "Physical",
          make_model: [n.make, n.model].filter(Boolean).join(" "),
          mgmt_ip: s(n.ip),
          role: n.type === "nas" ? "NAS / file storage" : "",
          notes,
        },
      };
    case "camera":
      return { tableKey: "cameras", data: { location: s(n.location) || n.label, make_model: [n.make, n.model].filter(Boolean).join(" "), notes } };
    case "printer":
      return { tableKey: "printers", data: { location: s(n.location) || n.label, make: s(n.make), model: s(n.model), notes } };
    default:
      return null;
  }
}

export const pushTopologyToInventory = authedAction
  .schema(z.object({ topologyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const t = await assertTopology(parsedInput.topologyId, ctx.organization.id);
    if (!t.graph) throw new PublicError("Nothing to push yet");

    let created = 0;
    const base = Math.floor(Date.now() / 1000);
    const nodes = [...t.graph.nodes];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.recordId) continue;
      const mapped = toRecord(n);
      if (!mapped) continue;
      const recordId = crypto.randomUUID();
      await db.insert(discoveryRecords).values({
        id: recordId,
        organizationId: ctx.organization.id,
        projectId: t.projectId,
        tableKey: mapped.tableKey,
        data: mapped.data,
        sortOrder: base + i,
        createdByMembershipId: ctx.membership.id,
        clientUpdatedAt: new Date(),
      });
      nodes[i] = { ...n, recordId };
      created++;
    }

    // Firewall → fill the firewall model answer if it's still blank.
    const fw = t.graph.nodes.find((n) => n.type === "firewall" && (n.make || n.model));
    if (fw) {
      await db
        .insert(discoveryAnswers)
        .values({
          organizationId: ctx.organization.id,
          projectId: t.projectId,
          questionKey: "firewall.fw_model",
          value: { v: [fw.make, fw.model].filter(Boolean).join(" ") },
          notes: "From topology",
          answeredByMembershipId: ctx.membership.id,
        })
        .onConflictDoNothing();
    }

    await db
      .update(discoveryTopologies)
      .set({ graph: { ...t.graph, nodes }, updatedAt: new Date() })
      .where(eq(discoveryTopologies.id, t.id));
    revalidatePath(`/discovery/${t.projectId}`);
    revalidatePath(`/discovery/${t.projectId}/topology/${t.id}`);
    return { created };
  });
