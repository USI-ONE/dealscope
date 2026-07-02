"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { addItOrderComment } from "@/server/actions/it-orders";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentBox({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");

  const submit = () => {
    if (text.trim().length < 1) return;
    start(async () => {
      const r = await addItOrderComment({ orderId, text });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      setText("");
      toast.success("Posted");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 rounded border bg-muted/10 p-2">
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note to the activity log…"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
          <Send className="mr-1 size-3.5" />
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
