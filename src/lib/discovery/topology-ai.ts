/**
 * Network topology extraction with Claude vision.
 *
 * Input: one or more images — a UniFi / Meraki / Omada topology screenshot,
 * a whiteboard, a hand-drawn diagram, or handwritten notes on a floor plan.
 * Output: a normalized TopologyGraph (nodes, links, VLANs, locations,
 * uncertainties) constrained by structured outputs and re-validated here.
 */
import Anthropic from "@anthropic-ai/sdk";
import { get } from "@vercel/blob";
import { z } from "zod";
import type { TopologyGraph } from "@/db/schema/discovery";
import { getAnthropic } from "@/lib/ai/anthropic";
import { PublicError } from "@/server/safe-action";

export const TOPOLOGY_MODEL = "claude-opus-5-5";

export const TOPOLOGY_SOURCE_KINDS = {
  unifi: "Controller screenshot (UniFi, Meraki, Omada…)",
  whiteboard: "Whiteboard",
  handwritten: "Hand-drawn diagram",
  floorplan: "Notes on a floor plan",
  other: "Other",
} as const;
export type TopologySourceKind = keyof typeof TOPOLOGY_SOURCE_KINDS;

export const NODE_TYPES = [
  "internet",
  "modem",
  "firewall",
  "router",
  "switch",
  "ap",
  "server",
  "nas",
  "workstation",
  "printer",
  "camera",
  "nvr",
  "phone",
  "iot",
  "cloud",
  "other",
] as const;
export const LINK_MEDIA = ["copper", "fiber", "wireless", "vpn", "unknown"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

const nullableString = { type: ["string", "null"] } as const;

const GRAPH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "nodes", "links", "vlans", "locations", "uncertainties"],
  properties: {
    summary: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "make", "model", "ip", "mac", "location", "notes", "confidence"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: [...NODE_TYPES] },
          make: nullableString,
          model: nullableString,
          ip: nullableString,
          mac: nullableString,
          location: nullableString,
          notes: nullableString,
          confidence: { type: "string", enum: [...CONFIDENCE] },
        },
      },
    },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "medium", "speed", "fromPort", "toPort", "label", "confidence"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          medium: { type: "string", enum: [...LINK_MEDIA] },
          speed: nullableString,
          fromPort: nullableString,
          toPort: nullableString,
          label: nullableString,
          confidence: { type: "string", enum: [...CONFIDENCE] },
        },
      },
    },
    vlans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "subnet", "notes"],
        properties: { id: { type: "string" }, name: nullableString, subnet: nullableString, notes: nullableString },
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "notes"],
        properties: { name: { type: "string" }, notes: nullableString },
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

const ns = z.string().nullable().optional();
const graphSchema = z.object({
  summary: z.string().default(""),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      make: ns,
      model: ns,
      ip: ns,
      mac: ns,
      location: ns,
      notes: ns,
      confidence: z.enum(CONFIDENCE).optional(),
    }),
  ),
  links: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      medium: ns,
      speed: ns,
      fromPort: ns,
      toPort: ns,
      label: ns,
      confidence: z.enum(CONFIDENCE).optional(),
    }),
  ),
  vlans: z.array(z.object({ id: z.string(), name: ns, subnet: ns, notes: ns })).default([]),
  locations: z.array(z.object({ name: z.string(), notes: ns })).default([]),
  uncertainties: z.array(z.string()).default([]),
});

const SYSTEM_PROMPT = `You are a senior network engineer documenting an existing site network before an infrastructure rip-and-replace. You read images of network diagrams and turn them into an accurate, structured topology.

Principles:
- Record only what the image shows or clearly implies. Never invent IP addresses, MACs, models, port numbers or speeds. Use null when a value is not visible.
- Every physical or logical device drawn or listed becomes a node. Give each node a short stable id (e.g. "fw1", "sw-core", "ap-lobby") and a human label as written in the image.
- Every line, arrow, cable, uplink or wireless hop becomes a link referencing node ids. Capture port labels, speeds and media when shown (fiber vs copper vs wireless mesh vs VPN).
- Use confidence "low" for anything you had to interpret from messy handwriting, partial occlusion, or ambiguous lines; "medium" for reasonable inferences; "high" when clearly legible.
- Put every ambiguity, illegible word, or thing the walker should verify on site into "uncertainties" as a short, actionable sentence.
- VLANs / subnets go in "vlans" when shown. Rooms, closets, floors or areas go in "locations", and the node's "location" should reference them.
- "summary" is 2-4 sentences an install team can read: overall shape (e.g. single firewall → core switch → 3 IDF switches), notable risks (daisy-chained unmanaged switches, single points of failure, mesh-only APs), and what's missing.`;

const SOURCE_GUIDANCE: Record<TopologySourceKind, string> = {
  unifi:
    "This is a screenshot of a network controller's live topology view (UniFi, Meraki, Omada or similar). Device names, models, uplink ports and link speeds are often printed next to each device or on the connecting lines; wireless mesh links are usually dashed. Client devices may be collapsed into counts — record a count as a note on the parent device rather than inventing individual clients.",
  whiteboard:
    "This is a photo of a whiteboard. Expect glare, perspective skew and partially erased marks — ignore erased ghost lines. Boxes/circles are devices, lines are links, and margin notes often hold IPs or VLANs.",
  handwritten:
    "This is a hand-drawn diagram on paper. Read handwriting carefully; when a label is ambiguous give your best reading and flag it in uncertainties.",
  floorplan:
    "These are handwritten notes on a building floor plan. Devices are marked in rooms (e.g. 'AP', 'SW 24p', 'cam', 'IDF'); lines may show cable paths between closets. Use room names/numbers from the plan as locations, and capture cable paths as links. Distances or run lengths written on the plan belong in the link label.",
  other: "Interpret the image as a network diagram or network notes.",
};

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const SUPPORTED_MEDIA = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Photos sit in a private blob store, so Claude can't fetch them by URL —
 * read them server-side and send base64.
 */
async function loadPrivateImage(blobUrl: string): Promise<{ mediaType: ImageMediaType; data: string }> {
  const res = await get(blobUrl, { access: "private" });
  if (!res || res.statusCode !== 200) throw new PublicError("A source photo is missing from storage");
  const mediaType = res.blob.contentType.split(";")[0].trim();
  if (!SUPPORTED_MEDIA.has(mediaType)) {
    throw new PublicError(`Unsupported image format (${mediaType}). Re-take the photo in the app or upload a JPEG/PNG screenshot.`);
  }
  const data = Buffer.from(await new Response(res.stream).arrayBuffer()).toString("base64");
  return { mediaType: mediaType as ImageMediaType, data };
}

export type ExtractInput = {
  /** Private blob URLs of the source photos. */
  imageUrls: string[];
  sourceKind: TopologySourceKind;
  hint?: string | null;
  previous?: TopologyGraph | null;
  correction?: string | null;
};

export async function extractTopology(input: ExtractInput): Promise<TopologyGraph> {
  const client = getAnthropic();

  const images = await Promise.all(input.imageUrls.map(loadPrivateImage));
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      }),
    ),
    {
      type: "text",
      text: [
        SOURCE_GUIDANCE[input.sourceKind],
        input.hint ? `Context from the walker: ${input.hint}` : null,
        input.previous
          ? `A previous extraction of these images is below. Apply the walker's correction and return the full corrected topology (keep ids stable where devices are unchanged).\n\nCorrection: ${input.correction ?? "(none)"}\n\nPrevious topology JSON:\n${JSON.stringify(input.previous)}`
          : "Extract the network topology from the image(s).",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];

  // `fallbacks` isn't in this SDK version's types yet; it's a documented
  // request field, so pass it through with the beta header.
  const params = {
    model: TOPOLOGY_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: GRAPH_JSON_SCHEMA },
    },
    messages: [{ role: "user", content }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming;

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.stream(params).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      throw new PublicError(`The image couldn't be processed: ${err.message}`);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new PublicError("AI is busy right now — try again in a minute.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new PublicError(`AI request failed (${err.status ?? "network"}). Try again.`);
    }
    throw err;
  }

  if (message.stop_reason === "refusal") {
    throw new PublicError("The AI declined to process this image.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new PublicError("The diagram was too large to extract in one pass — try cropping it into sections.");
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: z.infer<typeof graphSchema>;
  try {
    parsed = graphSchema.parse(JSON.parse(text));
  } catch {
    throw new PublicError("The AI returned an unreadable topology. Try again.");
  }
  return normalizeGraph(parsed);
}

/** Dedupe ids, drop links to unknown nodes, assign link ids. */
export function normalizeGraph(g: z.infer<typeof graphSchema> | TopologyGraph): TopologyGraph {
  const seen = new Set<string>();
  const nodes = g.nodes.map((n, i) => {
    let id = (n.id || `n${i + 1}`).trim().replace(/\s+/g, "-");
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return {
      ...n,
      id,
      type: (NODE_TYPES as readonly string[]).includes(n.type) ? n.type : "other",
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const links = g.links
    .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
    .map((l, i) => ({ ...l, id: "id" in l && typeof l.id === "string" && l.id ? l.id : `l${i + 1}` }));
  return {
    summary: g.summary ?? "",
    nodes,
    links,
    vlans: g.vlans ?? [],
    locations: g.locations ?? [],
    uncertainties: g.uncertainties ?? [],
  };
}

export { graphSchema as topologyGraphSchema };
