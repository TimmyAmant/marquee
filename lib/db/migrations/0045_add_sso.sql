CREATE TABLE "sso_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" "bytea",
	"client_secret_iv" "bytea",
	"client_secret_tag" "bytea",
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"public_url" text NOT NULL,
	"allow_signup" boolean DEFAULT false NOT NULL,
	"match_email" boolean DEFAULT false NOT NULL,
	"required_group" text,
	"trusted_group" text,
	"groups_claim" text DEFAULT 'groups' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_settings_singleton" CHECK ("sso_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_issuer" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_subject" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_sso_identity_idx" ON "users" USING btree ("sso_issuer","sso_subject");