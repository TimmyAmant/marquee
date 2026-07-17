-- Renaming rather than dropping+recreating preserves existing account data
-- (and the unique index) — a household's existing accounts just start being
-- addressed by "username" instead of "email", no re-signup needed. Existing
-- values (which look like email addresses) remain valid usernames; nothing
-- enforces a particular format going forward.
ALTER TABLE "users" RENAME COLUMN "email" TO "username";