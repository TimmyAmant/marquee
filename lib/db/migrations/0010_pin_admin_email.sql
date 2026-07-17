-- One-off: pin timmyamant@gmail.com as the household admin regardless of
-- which account was created first (the earlier one-off promotion in
-- 0008_eager_apocalypse.sql just picked whoever signed up first). Only
-- touches roles when that account actually exists, so this can't demote
-- the existing admin down to zero admins if the email hasn't signed up yet.
UPDATE "users" SET "role" = 'member'
WHERE "role" = 'admin' AND "email" <> 'timmyamant@gmail.com'
AND EXISTS (SELECT 1 FROM "users" WHERE "email" = 'timmyamant@gmail.com');--> statement-breakpoint
UPDATE "users" SET "role" = 'admin' WHERE "email" = 'timmyamant@gmail.com';