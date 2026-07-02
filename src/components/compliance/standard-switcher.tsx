"use client";

import { useRouter } from "next/navigation";

export function StandardSwitcher({
  basePath,
  standards,
  activeId,
}: {
  /** URL prefix without trailing slash, e.g. "/clients/abc/compliance"
   *  or "/diligence/xyz/compliance". The switcher appends ?standardId=ID. */
  basePath: string;
  standards: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  return (
    <select
      defaultValue={activeId}
      onChange={(e) => {
        router.push(`${basePath}?standardId=${e.target.value}`);
      }}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      {standards.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
