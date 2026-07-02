ALTER TABLE "diligence_sessions" ADD COLUMN "audio_url" text;
--> statement-breakpoint
ALTER TABLE "diligence_sessions" ADD COLUMN "audio_chunks_json" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "diligence_sessions" ADD COLUMN "transcript_text" text;
--> statement-breakpoint
ALTER TABLE "diligence_sessions" ADD COLUMN "transcript_status" text DEFAULT 'none' NOT NULL;
