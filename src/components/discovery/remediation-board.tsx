"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, MoreHorizontal, Plus, RotateCcw, Timer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addTask, buildRemediationPlan, deleteTask, updateTask } from "@/server/actions/discovery-remediation";
import { AREAS } from "@/lib/discovery/assessment";
import { cn } from "@/lib/utils";
import { PhotoStrip } from "./photo-strip";
import type { ServerPhoto } from "./project-context";
import { useDiscoveryProject } from "./project-context";

export type BoardTask = {
  id: string;
  title: string;
  detail: string | null;
  area: string | null;
  areaTitle: string;
  priority: string;
  status: string;
  source: string;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
  photos: ServerPhoto[];
};

const PRIORITY_STYLE: Record<string, string> = {
  Blocker: "bg-rose-600 text-white",
  High: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Low: "bg-muted text-muted-foreground",
};
const SOURCE_LABEL: Record<string, string> = { finding: "Finding", item: "Equipment", drop: "Cabling", manual: "Added" };
const FILTERS = [
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
] as const;

export function BuildPlanButton({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await buildRemediationPlan({ projectId });
          if (r?.serverError) return void toast.error(r.serverError);
          toast.success(`${r?.data?.added ?? 0} task${r?.data?.added === 1 ? "" : "s"} added`);
          router.refresh();
        })
      }
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {label}
    </button>
  );
}

export function TaskBoard({ projectId, tasks }: { projectId: string; tasks: BoardTask[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [adding, setAdding] = useState(false);
  const isOpen = (t: BoardTask) => t.status === "open" || t.status === "in_progress";

  const groups = useMemo(() => {
    const shown = tasks.filter((t) => (filter === "all" ? true : filter === "open" ? isOpen(t) : !isOpen(t)));
    const order = [...AREAS.map((a) => a.key as string), "other"];
    const by = new Map<string, BoardTask[]>();
    for (const t of shown) {
      const k = t.area && order.includes(t.area) ? t.area : "other";
      by.set(k, [...(by.get(k) ?? []), t]);
    }
    return order.filter((k) => by.has(k)).map((k) => ({ key: k, title: by.get(k)![0].areaTitle, tasks: by.get(k)! }));
  }, [tasks, filter]);

  const counts = { open: tasks.filter(isOpen).length, done: tasks.filter((t) => !isOpen(t)).length, all: tasks.length };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-8 rounded-full px-3.5 text-sm font-medium transition",
                filter === f.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium"
        >
          <Plus className="size-4" /> Add task
        </button>
      </div>

      {adding && <AddTaskForm projectId={projectId} onDone={() => setAdding(false)} />}

      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {filter === "open" ? "Everything on the plan is closed. Nice work." : "Nothing here yet."}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.title} <span className="tabular-nums">· {g.tasks.length}</span>
          </h3>
          <ul className="space-y-2">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} projectId={projectId} task={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskCard({ projectId, task }: { projectId: string; task: BoardTask }) {
  const router = useRouter();
  const { canEdit } = useDiscoveryProject();
  const [status, setStatus] = useState(task.status);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [pending, start] = useTransition();
  const done = status === "done";
  const skipped = status === "skipped";

  const set = (next: string) => {
    const prev = status;
    setStatus(next);
    setMenu(false);
    start(async () => {
      const r = await updateTask({ projectId, taskId: task.id, status: next as "open" });
      if (r?.serverError) {
        setStatus(prev);
        return void toast.error(r.serverError);
      }
      if (next === "done" && task.source === "finding") toast.success("Resolved — the assessment grade is updated");
      router.refresh();
    });
  };

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card shadow-sm transition-colors",
        done ? "border-emerald-500/30" : skipped ? "border-border opacity-70" : status === "in_progress" ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start gap-3 p-3.5">
        <button
          type="button"
          disabled={!canEdit || pending}
          onClick={() => set(done ? "open" : "done")}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90",
            done ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40 hover:border-emerald-600",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : done ? <Check className="size-4" /> : null}
        </button>

        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className={cn("text-[15px] font-semibold leading-snug", (done || skipped) && "text-muted-foreground line-through decoration-1")}>
            {task.title}
          </p>
          {task.detail && <p className="mt-0.5 text-sm text-muted-foreground">{task.detail}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className={cn("rounded-full px-2 py-0.5", PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.Low)}>{task.priority}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{SOURCE_LABEL[task.source] ?? task.source}</span>
            {status === "in_progress" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">In progress</span>}
            {skipped && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Skipped</span>}
            {task.photos.length > 0 && <span className="text-muted-foreground">· {task.photos.length} photo{task.photos.length === 1 ? "" : "s"}</span>}
            {done && task.completedBy && (
              <span className="font-normal text-muted-foreground">
                · Done by {task.completedBy}
                {task.completedAt && ` ${new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </span>
            )}
          </div>
        </button>

        <div className="relative flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Details"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            <ChevronDown className={cn("size-5 transition", open && "rotate-180")} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label="More"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <MoreHorizontal className="size-5" />
            </button>
          )}
          {menu && (
            <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
              {status !== "in_progress" && !done && (
                <MenuItem onClick={() => set("in_progress")} icon={<Timer className="size-4" />}>
                  Start
                </MenuItem>
              )}
              {!skipped && !done && (
                <MenuItem onClick={() => set("skipped")} icon={<X className="size-4" />}>
                  Skip (not needed)
                </MenuItem>
              )}
              {(done || skipped || status === "in_progress") && (
                <MenuItem onClick={() => set("open")} icon={<RotateCcw className="size-4" />}>
                  Reopen
                </MenuItem>
              )}
              {task.source === "manual" && (
                <MenuItem
                  danger
                  icon={<Trash2 className="size-4" />}
                  onClick={() =>
                    start(async () => {
                      setMenu(false);
                      const r = await deleteTask({ projectId, taskId: task.id });
                      if (r?.serverError) return void toast.error(r.serverError);
                      router.refresh();
                    })
                  }
                >
                  Delete
                </MenuItem>
              )}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3.5 pb-3.5 pt-3 sm:pl-[3.6rem]">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((task.notes ?? "") === notes) return;
              start(async () => {
                const r = await updateTask({ projectId, taskId: task.id, notes });
                if (r?.serverError) toast.error(r.serverError);
              });
            }}
            disabled={!canEdit}
            placeholder="Notes for the crew or the client…"
            className="min-h-[72px] w-full rounded-xl border border-border bg-background px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">After photos</p>
            <PhotoStrip target={{ questionKey: `task.${task.id}`, sectionKey: "remediation" }} serverPhotos={task.photos} title={task.title} />
          </div>
        </div>
      )}
    </li>
  );
}

function MenuItem({ onClick, icon, danger, children }: { onClick: () => void; icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent", danger && "text-destructive")}
    >
      {icon}
      {children}
    </button>
  );
}

function AddTaskForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState<"Blocker" | "High" | "Medium" | "Low">("Medium");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addTask({ projectId, title, area: area || null, priority });
          if (r?.serverError || r?.validationErrors) return void toast.error(r?.serverError ?? "Add a short title");
          setTitle("");
          onDone();
          router.refresh();
        });
      }}
      className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">Area…</option>
          {AREAS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.title}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
        >
          {["Blocker", "High", "Medium", "Low"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || title.trim().length < 2}
          className="ml-auto h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
      </div>
    </form>
  );
}
