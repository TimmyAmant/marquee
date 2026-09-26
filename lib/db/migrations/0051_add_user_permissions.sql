ALTER TABLE "users" ADD COLUMN "permissions" text[] DEFAULT ARRAY['requestMovies','requestTv','request4kMovies','request4kTv','reportIssues']::text[] NOT NULL;--> statement-breakpoint
-- Every existing account keeps exactly what it could do (lib/users/permissions.ts):
-- the admin every switch (never looked at: the admin can do everything),
-- a trusted member the Trusted preset, a member the Member preset plus the
-- auto-approval they had — which covered their 4K requests of that type too.
UPDATE "users" SET "permissions" = CASE
  WHEN "role" = 'admin' THEN ARRAY['requestMovies','requestTv','request4kMovies','request4kTv','autoApproveMovies','autoApproveTv','autoApprove4kMovies','autoApprove4kTv','advancedRequests','viewRequests','reviewRequests','manageIssues','reportIssues','manageBlocklist','bypassLimits']::text[]
  WHEN "role" = 'trusted' THEN ARRAY['requestMovies','requestTv','request4kMovies','request4kTv','autoApproveMovies','autoApproveTv','autoApprove4kMovies','autoApprove4kTv','advancedRequests','viewRequests','reviewRequests','manageIssues','reportIssues','bypassLimits']::text[]
  ELSE ARRAY['requestMovies','requestTv','request4kMovies','request4kTv']::text[]
    || CASE WHEN "auto_approve_movies" THEN ARRAY['autoApproveMovies','autoApprove4kMovies']::text[] ELSE ARRAY[]::text[] END
    || CASE WHEN "auto_approve_tv" THEN ARRAY['autoApproveTv','autoApprove4kTv']::text[] ELSE ARRAY[]::text[] END
    || ARRAY['reportIssues']::text[]
END;
