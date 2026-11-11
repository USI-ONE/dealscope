/**
 * Plain-English role names and descriptions shared by the Members page,
 * the invite / add-user forms, the accept page and the account emails,
 * so every place describes a role the same way.
 */
export type RoleKey = "owner" | "executive" | "manager" | "member" | "external_diligence";

export const ROLE_LABEL: Record<RoleKey, string> = {
  owner: "Owner",
  executive: "Executive",
  manager: "Manager",
  member: "Member",
  external_diligence: "External — Diligence only",
};

/** One line: what this role can do. */
export const ROLE_SUMMARY: Record<RoleKey, string> = {
  owner: "Full access, including inviting people and changing their roles.",
  executive: "Can view and edit everything, including finance.",
  manager: "Can create and edit engagements, site walks, findings and reports.",
  member: "Can view engagements and reports, and update the tasks assigned to them.",
  external_diligence:
    "Guest access to diligence engagements only — nothing else in the organization.",
};

/** Order used in role pickers, least access first. */
export const ROLE_ORDER: RoleKey[] = ["external_diligence", "member", "manager", "executive", "owner"];

export function roleLabel(role: string): string {
  return ROLE_LABEL[role as RoleKey] ?? role;
}
