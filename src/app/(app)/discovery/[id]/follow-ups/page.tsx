import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, CircleHelp } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { sectionFields } from "@/lib/discovery/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-ups" };

export default async function DiscoveryFollowUpsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const { template, answers } = await loadProjectData(project);

  const groups = template.sections
    .filter((s) => !project.naSections.includes(s.key))
    .map((s) => ({
      section: s,
      items: sectionFields(s).flatMap((f) => {
        const a = answers.get(f.questionKey);
        return a && !a.notApplicable && a.value?.followUp ? [{ field: f, notes: a.notes }] : [];
      }),
    }))
    .filter((g) => g.items.length > 0);
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Follow-ups</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {count
            ? `${count} question${count === 1 ? "" : "s"} couldn’t be answered on site. Answering one clears it from this list.`
            : "Nothing to follow up — every question has an answer or is N/A."}
        </p>
      </div>

      {groups.map(({ section, items }) => (
        <section key={section.key} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <h2 className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-semibold">
            {section.title}
            <span className="text-xs font-medium text-amber-600">{items.length}</span>
          </h2>
          <ul className="divide-y divide-border">
            {items.map(({ field, notes }) => (
              <li key={field.questionKey}>
                <Link
                  href={`/discovery/${project.id}/s/${section.key}?q=${encodeURIComponent(field.questionKey)}`}
                  className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 active:bg-accent"
                >
                  <CircleHelp className="size-4 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{field.label}</span>
                    {notes && <span className="block text-[13px] text-muted-foreground">{notes}</span>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
