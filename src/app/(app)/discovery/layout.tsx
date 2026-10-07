import { DiscoveryOutboxProvider } from "@/components/discovery/outbox-provider";
import { SyncStatus } from "@/components/discovery/sync-status";

export default function DiscoveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <DiscoveryOutboxProvider>
      <SyncStatus />
      {children}
    </DiscoveryOutboxProvider>
  );
}
