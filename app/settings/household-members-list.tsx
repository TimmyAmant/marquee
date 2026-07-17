"use client";

import { useActionState, useEffect, useState } from "react";
import { updateHouseholdMemberAction, deleteUserAction, type HouseholdMember } from "./users-actions";

function RemoveMemberButton({ member }: { member: HouseholdMember }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteUserAction, undefined);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.id} />
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      <span className="text-xs text-text-secondary">Remove {member.username}?</span>
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-red-400 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? "Removing…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

function EditMemberForm({
  member,
  onCancel,
  onSaved,
}: {
  member: HouseholdMember;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateHouseholdMemberAction, undefined);

  useEffect(() => {
    if (state?.success) onSaved();
  }, [state?.success, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3 px-6 py-4">
      <input type="hidden" name="userId" value={member.id} />
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        Name
        <input
          type="text"
          name="displayName"
          defaultValue={member.displayName ?? ""}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        Username
        <input
          type="text"
          name="username"
          required
          defaultValue={member.username}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current password"
          minLength={8}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function HouseholdMembersList({
  members,
  currentUserId,
  isAdmin,
}: {
  members: HouseholdMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border">
      {members.map((member) =>
        editingId === member.id ? (
          <li key={member.id}>
            <EditMemberForm
              member={member}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={member.id} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
            <div>
              <p className="text-text-primary">{member.displayName || member.username}</p>
              {member.displayName && <p className="mt-0.5 text-text-muted">{member.username}</p>}
            </div>
            <div className="flex items-center gap-3">
              {member.role === "admin" && (
                <span className="rounded-full border border-accent/50 px-2.5 py-0.5 text-xs text-accent">
                  Admin
                </span>
              )}
              {member.id === currentUserId && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  You
                </span>
              )}
              {(isAdmin || member.id === currentUserId) && (
                <button
                  onClick={() => setEditingId(member.id)}
                  className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
                >
                  Edit
                </button>
              )}
              {isAdmin && member.role !== "admin" && <RemoveMemberButton member={member} />}
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
