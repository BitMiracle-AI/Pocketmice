ALTER TABLE "file_versions" DROP CONSTRAINT "file_versions_file_id_files_id_fk";
--> statement-breakpoint
-- The three statements below are written by hand, in place of the one that was generated:
--   ALTER TABLE "file_versions" ADD COLUMN "space_id" uuid NOT NULL;
-- A table that has rows refuses that. The column is added empty, every version is given the space of its file,
-- and then the column is made NOT NULL.
ALTER TABLE "file_versions" ADD COLUMN "space_id" uuid;--> statement-breakpoint
UPDATE "file_versions" SET "space_id" = "files"."space_id" FROM "files" WHERE "files"."id" = "file_versions"."file_id";--> statement-breakpoint
ALTER TABLE "file_versions" ALTER COLUMN "space_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "space_invites" ADD COLUMN "storage_limit" bigint;--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "storage_limit" bigint;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "storage_limit" bigint;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_file_fk" FOREIGN KEY ("space_id","file_id") REFERENCES "public"."files"("space_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_versions_storage_size_idx" ON "file_versions" USING btree ("space_id","user_id","size");--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_storage_limit_check" CHECK ("space_invites"."storage_limit" >= 0);--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_storage_limit_check" CHECK ("space_members"."storage_limit" >= 0);--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_storage_limit_check" CHECK ("spaces"."storage_limit" >= 0);