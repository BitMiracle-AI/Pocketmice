ALTER TABLE "file_versions" RENAME COLUMN "key_id" TO "api_key_id";--> statement-breakpoint
ALTER TABLE "file_versions" DROP CONSTRAINT "file_versions_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;