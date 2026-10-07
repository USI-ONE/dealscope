/** Authenticated proxy URL for a photo (the blob store is private). */
export function photoUrl(projectId: string, photoId: string) {
  return `/discovery/${projectId}/photo/${photoId}`;
}

/** Blob pathname prefix every photo for a project must live under. */
export function photoPathPrefix(organizationId: string, projectId: string) {
  return `discovery/${organizationId}/${projectId}/`;
}
