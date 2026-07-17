"use client";

import { useActionState } from "react";
import { createUserAction } from "./users-actions";

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, undefined);

  if (state?.success) {
    return (
      <p className="text-sm text-owned">
        Account created — they can now sign in at{" "}
        <span className="text-text-primary">/login</span>.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
        Username
        <input
          type="text"
          name="username"
          required
          autoComplete="username"
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
        className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
