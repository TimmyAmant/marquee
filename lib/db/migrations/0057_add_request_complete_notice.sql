ALTER TABLE "requests" ADD COLUMN "notified_complete_at" timestamp with time zone;--> statement-breakpoint
-- Every request already there starts unarmed, so one that's long been in
-- the library isn't announced as "ready to watch" the day this ships
-- (lib/requests/complete.ts); new requests are armed from the start.
ALTER TABLE "requests" ADD COLUMN "complete_notice_armed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "complete_notice_armed" SET DEFAULT true;
