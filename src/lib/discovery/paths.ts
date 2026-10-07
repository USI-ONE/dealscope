/** Blob pathname prefix every photo for a project must live under. */
export function photoPathPrefix(organizationId: string, projectId: string) {
  return `discovery/${organizationId}/${projectId}/`;
}
