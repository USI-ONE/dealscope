"use client";

/**
 * Task checklist for a user provisioning request. Groups tasks by
 * category. Each task can be marked complete (with notes + result
 * fields), marked not-applicable, or expanded for editing.
 *
 * Result fields are free-form key/value entries — the field names that
 * appear in the completion DOCX have well-known keys (username, loginUrl,
 * mfaSetupLink, tempPasswordHandoffMethod, assetTag, serialNumber, etc.)
 * but you can capture anything.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addProvisioningTask,
  removeProvisioningTask,
  updateProvisioningTask,
} from "@/server/actions/user-provisioning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROVISIONING_TASK_CATEGORY_LABEL,
  type ProvisioningTask,
} from "@/db/schema";

type Category = ProvisioningTask["category"];

const CATEGORY_ORDER: Category[] = [
  "identity",
  "mailbox",
  "license",
  "access",
  "hardware",
  "training",
  "data",
  "communication",
  "other",
];

export function TaskChecklist({
  requestId,
  tasks,
  canEdit,
}: {
  requestId: string;
  tasks: ProvisioningTask[];
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const byCategory = new Map<Category, ProvisioningTask[]>();
  for (const c of CATEGORY_ORDER) byCategory.set(c, []);
  for (const t of tasks) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  const completedCount = tasks.filter((t) => t.applicable && t.completed).length;
  const applicableCount = tasks.filter((t) => t.applicable).length;
  const pct = applicableCount === 0
    ? 0
    : Math.round((completedCount / applicableCount) * 100);

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">
            {completedCount} / {applicableCount} tasks complete
          </span>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <CategorySection
            key={cat}
            requestId={requestId}
            category={cat}
            tasks={list}
            canEdit={canEdit}
          />
        );
      })}

      {canEdit && !showAdd && (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 size-3.5" /> Add custom task
        </Button>
      )}
      {canEdit && showAdd && (
        <NewTaskForm
          requestId={requestId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function CategorySection({
  requestId,
  category,
  tasks,
  canEdit,
}: {
  requestId: string;
  category: Category;
  tasks: ProvisioningTask[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(true);
  const done = tasks.filter((t) => t.applicable && t.completed).length;
  const applicable = tasks.filter((t) => t.applicable).length;
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span className="font-semibold">
            {PROVISIONING_TASK_CATEGORY_LABEL[category] ?? category}
          </span>
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {done} / {applicable}
        </span>
      </button>
      {open && (
        <div className="space-y-1 px-3 py-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              requestId={requestId}
              task={t}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  requestId,
  task,
  canEdit,
}: {
  requestId: string;
  task: ProvisioningTask;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);

  const toggle = () => {
    start(async () => {
      const r = await updateProvisioningTask({
        requestId,
        taskId: task.id,
        patch: { completed: !task.completed },
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      router.refresh();
    });
  };

  const toggleApplicable = () => {
    start(async () => {
      const r = await updateProvisioningTask({
        requestId,
        taskId: task.id,
        patch: { applicable: !task.applicable },
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      router.refresh();
    });
  };

  if (editing) {
    return (
      <div className="rounded border bg-muted/10 p-2">
        <EditTaskForm
          requestId={requestId}
          task={task}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  const resultEntries = Object.entries(task.result ?? {}).filter(
    ([, v]) => v !== null && v !== "",
  );

  return (
    <div
      className={`rounded border bg-card p-2 text-sm ${
        !task.applicable ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            type="button"
            onClick={canEdit && task.applicable ? toggle : undefined}
            disabled={pending || !canEdit || !task.applicable}
            className={`flex size-5 shrink-0 items-center justify-center rounded border ${
              task.completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-muted-foreground/30 bg-card"
            } ${canEdit && task.applicable ? "hover:border-primary" : "cursor-default"}`}
            title={
              !task.applicable
                ? "Not applicable"
                : task.completed
                  ? "Mark incomplete"
                  : "Mark complete"
            }
          >
            {task.completed ? <Check className="size-3" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={`font-medium ${!task.applicable ? "line-through" : ""}`}
              >
                {task.title}
              </span>
              {task.required && (
                <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Required
                </span>
              )}
              {!task.applicable && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  N/A
                </span>
              )}
            </div>
            {task.description && !task.completed && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {task.description}
              </p>
            )}
            {task.completionNotes && (
              <p className="mt-1 whitespace-pre-wrap rounded bg-muted/30 p-1.5 text-xs">
                {task.completionNotes}
              </p>
            )}
            {resultEntries.length > 0 && (
              <div className="mt-1 space-y-0.5 rounded bg-emerald-500/5 p-1.5 text-[11px]">
                {resultEntries.map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground">{prettyKey(k)}:</span>{" "}
                    <span className="font-mono">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              title="Edit / add result details"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleApplicable}
              disabled={pending}
              title={
                task.applicable ? "Mark not applicable" : "Mark applicable"
              }
              className="text-xs"
            >
              {task.applicable ? "N/A" : "Apply"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditTaskForm({
  requestId,
  task,
  onClose,
}: {
  requestId: string;
  task: ProvisioningTask;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [completed, setCompleted] = useState(task.completed);
  const [notes, setNotes] = useState(task.completionNotes ?? "");
  const [resultPairs, setResultPairs] = useState(() => {
    const entries = Object.entries(task.result ?? {});
    return entries.length > 0
      ? entries.map(([k, v]) => ({ key: k, value: String(v ?? "") }))
      : suggestResultKeysFor(task.title).map((k) => ({ key: k, value: "" }));
  });

  const submit = () => {
    start(async () => {
      const result: Record<string, string | number | boolean | null> = {};
      for (const p of resultPairs) {
        if (p.key.trim().length === 0) continue;
        result[p.key.trim()] = p.value || null;
      }
      const r = await updateProvisioningTask({
        requestId,
        taskId: task.id,
        patch: {
          completed,
          completionNotes: notes || null,
          result,
        },
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Saved");
      onClose();
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm("Remove this task from the checklist?")) return;
    start(async () => {
      const r = await removeProvisioningTask({ requestId, taskId: task.id });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Removed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{task.title}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          disabled={pending}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground">{task.description}</p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
        />
        Mark complete
      </label>
      <div>
        <Label className="text-xs">Completion notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">
          Result details (key / value — flow into the handoff document)
        </Label>
        <div className="space-y-1">
          {resultPairs.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-1">
              <Input
                value={p.key}
                onChange={(e) => {
                  const next = [...resultPairs];
                  next[i] = { ...next[i], key: e.target.value };
                  setResultPairs(next);
                }}
                placeholder="key (e.g. username)"
                className="h-8 text-xs"
              />
              <Input
                value={p.value}
                onChange={(e) => {
                  const next = [...resultPairs];
                  next[i] = { ...next[i], value: e.target.value };
                  setResultPairs(next);
                }}
                placeholder="value"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResultPairs(resultPairs.filter((_, j) => j !== i));
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setResultPairs([...resultPairs, { key: "", value: "" }])
            }
          >
            <Plus className="mr-1 size-3" /> Add field
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function NewTaskForm({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [required, setRequired] = useState(false);

  const submit = () => {
    if (title.trim().length < 1) {
      toast.error("Title required");
      return;
    }
    start(async () => {
      const r = await addProvisioningTask({
        requestId,
        title,
        description: description || null,
        category,
        required,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Added");
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 rounded border bg-muted/20 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_14rem]">
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {PROVISIONING_TASK_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required (blocks ready-for-handoff until complete)
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          Add
        </Button>
      </div>
    </div>
  );
}

function prettyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Suggest likely result fields based on the task title. Speeds up
 *  data entry — user can edit / extend. */
function suggestResultKeysFor(title: string): string[] {
  const t = title.toLowerCase();
  if (t.includes("identity") || t.includes("m365") || t.includes("entra"))
    return ["username", "loginUrl", "tempPasswordHandoffMethod"];
  if (t.includes("mfa"))
    return ["mfaSetupLink", "method"];
  if (t.includes("license"))
    return ["sku", "count"];
  if (t.includes("mailbox"))
    return ["mailboxType", "primaryAddress"];
  if (t.includes("forward"))
    return ["forwardedTo", "until"];
  if (t.includes("hardware") || t.includes("device") || t.includes("laptop"))
    return ["assetTag", "serialNumber", "model"];
  if (t.includes("group"))
    return ["groupsAdded", "groupsRemoved"];
  if (t.includes("phone") || t.includes("extension"))
    return ["did", "extension"];
  if (t.includes("welcome"))
    return ["sentAt", "to"];
  return [];
}
