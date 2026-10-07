import type { TopologyGraph } from "@/db/schema/discovery";

export const NODE_W = 156;
export const NODE_H = 58;
const GAP_X = 28;
const GAP_Y = 84;
const PAD = 24;

/** Rough top-down rank so the edge sits at the top even if links are sparse. */
const TYPE_RANK: Record<string, number> = {
  internet: 0,
  cloud: 0,
  modem: 1,
  firewall: 2,
  router: 2,
  switch: 3,
  server: 4,
  nas: 4,
  nvr: 4,
  ap: 5,
  workstation: 6,
  printer: 6,
  camera: 6,
  phone: 6,
  iot: 6,
  other: 6,
};

export type Positioned = { id: string; x: number; y: number };

/**
 * Layered layout: BFS from the network edge (internet / modem / firewall),
 * then order each layer by the mean x of its parents to reduce crossings.
 * Disconnected nodes fall into rows at the bottom by type.
 */
export function layoutTopology(graph: TopologyGraph) {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const l of graph.links) {
    adj.get(l.from)?.push(l.to);
    adj.get(l.to)?.push(l.from);
  }

  const minRank = Math.min(...graph.nodes.map((n) => TYPE_RANK[n.type] ?? 6), 6);
  let roots = graph.nodes.filter((n) => (TYPE_RANK[n.type] ?? 6) === minRank && (adj.get(n.id)?.length ?? 0) > 0);
  if (!roots.length) {
    const best = [...graph.nodes].sort((a, b) => (adj.get(b.id)?.length ?? 0) - (adj.get(a.id)?.length ?? 0))[0];
    roots = best ? [best] : [];
  }

  const level = new Map<string, number>();
  const parents = new Map<string, string[]>();
  const queue = roots.map((r) => r.id);
  for (const r of queue) level.set(r, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const nb of adj.get(id) ?? []) {
      if (!level.has(nb)) {
        level.set(nb, level.get(id)! + 1);
        parents.set(nb, [id]);
        queue.push(nb);
      } else if (level.get(nb) === level.get(id)! + 1) {
        parents.get(nb)?.push(id);
      }
    }
  }

  // Unreached nodes: one extra row per type rank, below the tree.
  const maxLevel = Math.max(-1, ...level.values());
  for (const n of graph.nodes) {
    if (!level.has(n.id)) level.set(n.id, maxLevel + 1 + (TYPE_RANK[n.type] ?? 6) / 10);
  }

  const levels = [...new Set(level.values())].sort((a, b) => a - b);
  const rows = levels.map((lv) => graph.nodes.filter((n) => level.get(n.id) === lv).map((n) => n.id));

  const xOf = new Map<string, number>();
  rows.forEach((row, ri) => {
    if (ri > 0) {
      row.sort((a, b) => bary(a) - bary(b));
    }
    row.forEach((id, i) => xOf.set(id, i));
    function bary(id: string) {
      const ps = parents.get(id) ?? [];
      if (!ps.length) return Number.MAX_SAFE_INTEGER;
      return ps.reduce((s, p) => s + (xOf.get(p) ?? 0) / Math.max(1, rowLen(p)), 0) / ps.length;
    }
  });
  function rowLen(id: string) {
    return rows.find((r) => r.includes(id))?.length ?? 1;
  }

  const widest = Math.max(1, ...rows.map((r) => r.length));
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X;
  const positions = new Map<string, Positioned>();
  rows.forEach((row, ri) => {
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    const offset = (width - rowW) / 2;
    row.forEach((id, i) => {
      positions.set(id, { id, x: offset + i * (NODE_W + GAP_X), y: PAD + ri * (NODE_H + GAP_Y) });
    });
  });
  const height = PAD * 2 + rows.length * NODE_H + Math.max(0, rows.length - 1) * GAP_Y;
  return { positions, width, height };
}
