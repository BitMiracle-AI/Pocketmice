ALTER TABLE "messages" ADD COLUMN "mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;