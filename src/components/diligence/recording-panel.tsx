"use client";

import { useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Loader2, Mic, MicOff, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Stage =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "extracting"
  | "done"
  | "error";

type CaptureMode = "mic" | "full";

export function RecordingPanel({
  sessionId,
  initialStatus,
}: {
  sessionId: string;
  engagementId: string;
  initialStatus: string;
}) {
  const [stage, setStage] = useState<Stage>(
    initialStatus === "done"
      ? "done"
      : initialStatus === "error"
        ? "error"
        : "idle",
  );
  const [captureMode, setCaptureMode] = useState<CaptureMode>("mic");
  const [seconds, setSeconds] = useState(0);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [systemAudioMissing, setSystemAudioMissing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [transcriptWords, setTranscriptWords] = useState(0);
  const [transcriptSnippet, setTranscriptSnippet] = useState("");
  const [extractCount, setExtractCount] = useState(0);
  const [answers, setAnswers] = useState<Array<{ questionKey: string; value: unknown }>>([]);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Idle safety: show prompt at 30min, auto-stop 30min after prompt if no response
  const nextPromptAtRef = useRef(1800);
  const promptShownAtRef = useRef<number | null>(null);
  const showPromptRef = useRef(false);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  async function startRecording(mode: CaptureMode) {
    try {
      setSystemAudioMissing(false);
      chunksRef.current = [];
      chunkIndexRef.current = 0;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      let recordingStream: MediaStream;

      if (mode === "full") {
        // getDisplayMedia must be the first call — it requires a direct user gesture.
        // The browser share dialog will appear; user selects a window/tab and (on
        // Chrome/Windows) enables "Share system audio."
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        displayStreamRef.current = displayStream;

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;

        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const destination = audioCtx.createMediaStreamDestination();

        // Mix local mic
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);

        // Mix system audio (remote party) if the user enabled it in the share dialog
        const systemTracks = displayStream.getAudioTracks();
        if (systemTracks.length > 0) {
          const sysStream = new MediaStream(systemTracks);
          const sysSource = audioCtx.createMediaStreamSource(sysStream);
          sysSource.connect(destination);
        } else {
          // User didn't enable "Share system audio" — still record mic-only
          setSystemAudioMissing(true);
        }

        recordingStream = destination.stream;

        // If the user clicks "Stop sharing" in the browser's native share bar, stop recording
        displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
          mediaRef.current?.stop();
        });
      } else {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        recordingStream = micStream;
      }

      const mr = new MediaRecorder(recordingStream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      mediaRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          const idx = chunkIndexRef.current++;
          const fd = new FormData();
          fd.append("file", e.data, `chunk-${idx}.webm`);
          fd.append("index", String(idx));
          fetch(`/api/diligence/sessions/${sessionId}/chunk`, {
            method: "POST",
            body: fd,
          }).catch(() => {});
        }
      };

      mr.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        displayStreamRef.current?.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        const combined = new Blob(chunksRef.current, { type: mimeType });
        await runPipeline(combined);
      };

      mr.start(30000);
      setStage("recording");
      setSeconds(0);
      setShowContinuePrompt(false);
      nextPromptAtRef.current = 1800;
      promptShownAtRef.current = null;
      showPromptRef.current = false;
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (!showPromptRef.current && next >= nextPromptAtRef.current) {
            showPromptRef.current = true;
            promptShownAtRef.current = next;
            setShowContinuePrompt(true);
          } else if (
            showPromptRef.current &&
            promptShownAtRef.current !== null &&
            next >= promptShownAtRef.current + 1800
          ) {
            mediaRef.current?.stop();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      // User cancelled the share dialog or mic was denied
      const msg = err instanceof Error ? err.message : "Could not start recording";
      setErrorMsg(
        msg.includes("Permission denied") || msg.includes("NotAllowedError")
          ? "Microphone or screen share access was denied."
          : msg,
      );
      setStage("error");
      // Clean up any partially-acquired streams
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }
  }

  function stopRecording() {
    setShowContinuePrompt(false);
    showPromptRef.current = false;
    mediaRef.current?.stop();
  }

  function keepRecording() {
    setShowContinuePrompt(false);
    showPromptRef.current = false;
    promptShownAtRef.current = null;
    setSeconds((s) => {
      nextPromptAtRef.current = s + 1800;
      return s;
    });
  }

  async function runPipeline(blob: Blob) {
    try {
      setStage("uploading");
      const fd = new FormData();
      fd.append("file", blob, "recording.webm");
      const tRes = await fetch(
        `/api/diligence/sessions/${sessionId}/transcribe`,
        { method: "POST", body: fd },
      );
      const tData = await tRes.json().catch(() => ({})) as { transcript?: string; error?: string };
      if (!tRes.ok) throw new Error(tData.error ?? "Transcription failed");
      const transcript = tData.transcript ?? "";

      const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
      setTranscriptWords(words);
      setTranscriptSnippet(transcript.slice(0, 160).trimEnd());

      setStage("extracting");

      const eRes = await fetch(
        `/api/diligence/sessions/${sessionId}/extract`,
        { method: "POST" },
      );
      if (!eRes.ok) {
        const body = await eRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Extraction failed");
      }
      const eData = (await eRes.json()) as {
        count: number;
        answers: Array<{ questionKey: string; value: unknown }>;
      };

      setExtractCount(eData.count);
      setAnswers(eData.answers ?? []);
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Processing failed");
      setStage("error");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Interview Recording</CardTitle>
        {stage === "recording" && (
          <span className="flex items-center gap-2 text-sm text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            {captureMode === "full" ? <Monitor className="size-3.5" /> : <Mic className="size-3.5" />}
            {fmt(seconds)}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">

        {stage === "idle" && (
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Capture mode
              </p>
              <div className="inline-flex rounded-xl border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setCaptureMode("mic")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                    captureMode === "mic"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Mic className="size-3.5" />
                  Mic only
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode("full")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all",
                    captureMode === "full"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Monitor className="size-3.5" />
                  Full call capture
                </button>
              </div>
            </div>

            <Button
              onClick={() => startRecording(captureMode)}
              variant="outline"
              className="gap-2"
            >
              <Mic className="size-4" />
              Start Recording
            </Button>

            <p className="text-[12px] text-muted-foreground">
              {captureMode === "mic"
                ? "Records your microphone only. Best for in-person interviews."
                : "Captures all call audio — both your voice and the remote party's. A browser screen share dialog will open; select the window your call is in and enable \"Share system audio\" when prompted."}
            </p>

            {captureMode === "full" && (
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Browser support
                </p>
                <ul className="space-y-1">
                  {[
                    { label: "Chrome on Windows", status: "full" as const, note: "Full support — speakers, headphones, or Bluetooth" },
                    { label: "Edge on Windows", status: "full" as const, note: "Full support" },
                    { label: "Chrome on macOS", status: "none" as const, note: "Apple blocks system audio capture at the OS level" },
                    { label: "Firefox", status: "none" as const, note: "getDisplayMedia audio not supported" },
                    { label: "Safari", status: "none" as const, note: "Not supported" },
                  ].map(({ label, status, note }) => (
                    <li key={label} className="flex items-start gap-2 text-[11px]">
                      <span className={status === "full" ? "text-emerald-500" : "text-muted-foreground/50"}>
                        {status === "full" ? "✓" : "✗"}
                      </span>
                      <span>
                        <span className={status === "full" ? "font-medium text-foreground" : "text-muted-foreground"}>
                          {label}
                        </span>
                        <span className="text-muted-foreground/70"> — {note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {stage === "recording" && (
          <div className="space-y-3">
            {systemAudioMissing && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/40">
                <p className="text-[12px] text-amber-700 dark:text-amber-400">
                  System audio was not enabled — recording mic only. Next time, check &ldquo;Share system audio&rdquo; in the browser share dialog.
                </p>
              </div>
            )}

            {showContinuePrompt && promptShownAtRef.current !== null && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/40">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[13px] font-medium text-amber-900 dark:text-amber-200">
                      Still recording?
                    </p>
                    <p className="text-[12px] text-amber-700 dark:text-amber-400">
                      Recording will stop automatically in{" "}
                      {fmt(Math.max(0, promptShownAtRef.current + 1800 - seconds))} if no action is taken.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-800/40"
                        onClick={keepRecording}
                      >
                        Keep recording
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7"
                        onClick={stopRecording}
                      >
                        Stop &amp; Process
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={stopRecording} variant="destructive" className="gap-2">
              <MicOff className="size-4" />
              Stop Recording
            </Button>
          </div>
        )}

        {(stage === "uploading" || stage === "transcribing" || stage === "extracting") && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {stage === "uploading" && "Uploading recording…"}
            {stage === "transcribing" && "Transcribing audio…"}
            {stage === "extracting" && "Extracting answers from transcript…"}
          </div>
        )}

        {stage === "done" && (
          <>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                Transcription complete — {transcriptWords.toLocaleString()} word{transcriptWords !== 1 ? "s" : ""} captured
              </div>
              {transcriptSnippet && (
                <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                  &ldquo;{transcriptSnippet}{transcriptSnippet.length >= 160 ? "…" : ""}&rdquo;
                </p>
              )}
              {transcriptWords === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  No speech detected — check that your microphone was picking up audio.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <CheckCircle className="size-3.5 text-emerald-500 shrink-0" />
                {extractCount > 0
                  ? `${extractCount} answer${extractCount !== 1 ? "s" : ""} added to the questionnaire`
                  : "No answers extracted from this transcript"}
              </div>
              {extractCount === 0 && transcriptWords > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  The transcript didn&apos;t contain clear matches for unanswered catalog questions. Try reviewing the notes manually or recording a more structured interview.
                </p>
              )}
              {answers.length > 0 && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                    View {answers.length} extracted answer{answers.length !== 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-1">
                    {answers.map((a) => (
                      <li key={a.questionKey} className="flex gap-2 text-[11px]">
                        <span className="shrink-0 font-mono text-muted-foreground/60">{a.questionKey}</span>
                        <span className="truncate text-foreground">{String(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStage("idle");
                setSeconds(0);
                setAnswers([]);
                setTranscriptWords(0);
                setTranscriptSnippet("");
                setSystemAudioMissing(false);
              }}
            >
              Record another session
            </Button>
          </>
        )}

        {stage === "error" && (
          <>
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {errorMsg || "An error occurred"}
            </div>
            <Button variant="outline" size="sm" onClick={() => setStage("idle")}>
              Try again
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
