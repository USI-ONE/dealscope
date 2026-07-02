"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cloneStarterPack } from "@/server/actions/compliance";
import { Button } from "@/components/ui/button";

export function CloneStarterPackButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        start(async () => {
          const r = await cloneStarterPack({ slug });
          if (r?.serverError) {
            toast.error(r.serverError);
            return;
          }
          const id = r?.data?.standard?.id;
          toast.success("Starter pack cloned");
          if (id) router.push(`/standards/${id}`);
          else router.refresh();
        })
      }
      disabled={pending}
    >
      <Copy className="mr-1 size-3.5" />
      {pending ? "Cloning…" : "Clone into my org"}
    </Button>
  );
}
