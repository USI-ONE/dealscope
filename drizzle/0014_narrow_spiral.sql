ALTER TABLE "member_invitations" ADD COLUMN "last_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_invitations" ADD COLUMN "email_send_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_invitations" ADD COLUMN "last_email_error" text;