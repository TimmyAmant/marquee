"use client";

import { useActionState } from "react";
import { setupAction } from "./actions";

export function SetupForm() {
  const [state, formAction, isPending] = useActionState(setupAction, undefined);

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">Set up Marquee</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Create the first account for this Marquee instance. Additional accounts for
        other household members can be added later from Settings.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Name
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Creating account…" : "Create admin account"}
        </button>
      </form>
    </div>
  );
}
