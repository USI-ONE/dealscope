"use client";

import { createContext, useContext } from "react";

export type ServerPhoto = {
  id: string;
  url: string;
  caption: string | null;
  takenAt: string | null;
  questionKey: string | null;
  recordId: string | null;
  sectionKey: string | null;
  widthPx: number | null;
  heightPx: number | null;
};

type ProjectCtx = {
  projectId: string;
  projectName: string;
  pathPrefix: string;
  canEdit: boolean;
};

const Ctx = createContext<ProjectCtx | null>(null);

export function DiscoveryProjectProvider({ value, children }: { value: ProjectCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDiscoveryProject() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDiscoveryProject must be used inside DiscoveryProjectProvider");
  return ctx;
}
