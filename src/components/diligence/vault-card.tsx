"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Globe,
  Lock,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deleteVaultFile, updateVaultFile } from "@/server/actions/diligence-vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type VaultFile = {
  id: string;
  name: string;
  description: string | null;
  track: string | null;
  blobUrl: string;
  sizeBytes: number;
  mimeType: string | null;
  accessTier: "private" | "shared";
  uploadedByName?: string | null;
  createdAt: string;
};

const TRACK_LABELS: Record<string, string> = {
  it: "IT",
  legal: "Legal",
  finance: "Finance",
  facilities: "Facilities",
  hr: "HR",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultCard({
  engagementId,
  files,
  canEdit,
}: {
  engagementId: string;
  files: VaultFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTrack, setUploadTrack] = useState<string>("");
  const [uploadTier, setUploadTier] = useState<"private" | "shared">("private");

  const filtered =
    trackFilter === "all" ? files : files.filter((f) => f.track === trackFilter);

  const uploadFiles = async (picked: FileList) => {
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(picked)) {
      const fd = new FormData();
      fd.append("file", file);
      if (uploadTrack) fd.append("track", uploadTrack);
      fd.append("accessTier", uploadTier);
      try {
        const res = await fetch(`/diligence/${engagementId}/vault`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) uploaded++;
        else {
          const body = await res.json().catch(() => ({}));
          toast.error(`Failed to upload ${file.name}: ${body.error ?? res.status}`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      toast.success(`${uploaded} file${uploaded > 1 ? "s" : ""} uploaded`);
      router.refresh();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (file: VaultFile) => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteVaultFile({ fileId: file.id, engagementId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("File deleted");
        router.refresh();
      }
    });
  };

  const toggleTier = (file: VaultFile) => {
    const next = file.accessTier === "private" ? "shared" : "private";
    start(async () => {
      const r = await updateVaultFile({ fileId: file.id, engagementId, accessTier: next });
      if (r?.serverError) toast.error(r.serverError);
      else router.refresh();
    });
  };

  const tracks = ["it", "legal", "finance", "facilities", "hr"];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="size-4 text-primary" />
              Deal Vault
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Encrypted, access-controlled file storage for this engagement. Direct blob URLs
              are never exposed — all downloads are proxied through authenticated sessions only.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: "SOC 2 Type II", title: "Infrastructure undergoes annual SOC 2 Type II audits covering security, availability, and confidentiality controls." },
                { label: "GDPR", title: "Storage infrastructure is GDPR compliant — data residency and processing agreements available." },
                { label: "CCPA", title: "California Consumer Privacy Act compliance supported through Vercel's data processing agreements." },
                { label: "TLS 1.3", title: "All data is encrypted in transit using TLS 1.3 and at rest using AES-256." },
                { label: "AES-256 at rest", title: "Files are encrypted at rest using AES-256 on Vercel Blob infrastructure." },
              ].map(({ label, title }) => (
                <span
                  key={label}
                  title={title}
                  className="inline-flex items-center rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary cursor-help"
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Files marked <span className="font-medium">Shared</span> are accessible to
              invited Deal Room parties; <span className="font-medium">Private</span> files
              are visible to your team only.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <select
                value={uploadTrack}
                onChange={(e) => setUploadTrack(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">General</option>
                {tracks.map((t) => (
                  <option key={t} value={t}>{TRACK_LABELS[t]}</option>
                ))}
              </select>
              <select
                value={uploadTier}
                onChange={(e) => setUploadTier(e.target.value as "private" | "shared")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-8"
              >
                <Upload className="mr-1 size-3.5" />
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
            </div>
          )}
        </div>

        {/* Track filter tabs */}
        <div className="flex flex-wrap gap-1 pt-1">
          {["all", ...tracks].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrackFilter(t)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                trackFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {t === "all" ? `All (${files.length})` : TRACK_LABELS[t]}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {files.length === 0
              ? "No files yet. Upload documents, contracts, or reports to build your deal vault."
              : "No files in this track."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-3 rounded-md border bg-card p-3 text-sm"
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/diligence/${engagementId}/vault/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.name}
                    </a>
                    {f.track && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {TRACK_LABELS[f.track] ?? f.track}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                        f.accessTier === "shared"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.accessTier === "shared" ? (
                        <Globe className="size-2.5" />
                      ) : (
                        <Lock className="size-2.5" />
                      )}
                      {f.accessTier === "shared" ? "Shared" : "Private"}
                    </span>
                  </div>
                  {f.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatBytes(f.sizeBytes)}
                    {f.uploadedByName && ` · ${f.uploadedByName}`}
                    {" · "}
                    {new Date(f.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a href={`/diligence/${engagementId}/vault/${f.id}`} download={f.name}>
                    <Button variant="ghost" size="sm" className="h-7 px-2" title="Download">
                      <Download className="size-3.5" />
                    </Button>
                  </a>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => toggleTier(f)}
                        disabled={pending}
                        title={
                          f.accessTier === "private"
                            ? "Make shared with deal room"
                            : "Make private"
                        }
                      >
                        {f.accessTier === "private" ? (
                          <Globe className="size-3.5" />
                        ) : (
                          <Lock className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(f)}
                        disabled={pending}
                        title="Delete file"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
