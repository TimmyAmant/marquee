"use client";

import { useState } from "react";
import {
  normalizePermissions,
  PERMISSION_GROUPS,
  presetFor,
  presetPermissions,
  type Permission,
  type PermissionPreset,
} from "@/lib/users/permissions";

// The admin's per-member switches (lib/users/permissions.ts), grouped, with
// a preset picker on top that fills them in — and reads "Custom" as soon as
// they differ from both presets. Sent with the member edit form as
// `perm:<name>` checkboxes plus `permissionsForm=1`; the server works the
// role out from them.

const PRESET_LABEL: Record<Exclude<PermissionPreset, "admin">, string> = {
  member: "Member",
  trusted: "Trusted",
  custom: "Custom",
};

export function PermissionsEditor({ initial }: { initial: string[] }) {
  const [granted, setGranted] = useState<Set<Permission>>(() => new Set(normalizePermissions(initial)));
  const preset = presetFor({ role: "member", permissions: [...granted] });
  const reviews = granted.has("reviewRequests");

  function toggle(permission: Permission, on: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(permission);
      else next.delete(permission);
      // Reviewing requests means seeing them.
      if (permission === "reviewRequests" && on) next.add("viewRequests");
      return next;
    });
  }

  return (
    <fieldset className="flex flex-col gap-4 text-sm text-text-secondary">
      <input type="hidden" name="permissionsForm" value="1" />
      <label className="flex flex-col gap-1.5">
        What they can do
        <select
          value={preset === "admin" ? "custom" : preset}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "member" || value === "trusted") setGranted(new Set(presetPermissions(value)));
          }}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        >
          <option value="member">{PRESET_LABEL.member} — requests, and reports problems</option>
          <option value="trusted">{PRESET_LABEL.trusted} — also reviews requests and problem reports</option>
          <option value="custom" disabled={preset !== "custom"}>
            {PRESET_LABEL.custom}
          </option>
        </select>
      </label>

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{group.title}</p>
          {group.items.map((item) => {
            // Locked on while they review requests (can() treats it so).
            const locked = item.permission === "viewRequests" && reviews;
            const checked = granted.has(item.permission) || locked;
            return (
              <label key={item.permission} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name={`perm:${item.permission}`}
                  checked={checked}
                  disabled={locked}
                  onChange={(event) => toggle(item.permission, event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
                />
                {/* A disabled box isn't sent; this keeps it on. */}
                {locked && <input type="hidden" name={`perm:${item.permission}`} value="on" />}
                <span>
                  <span className="text-text-primary">{item.label}</span>
                  <span className="block text-xs text-text-muted">
                    {locked ? "Comes with reviewing requests." : item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ))}
      <p className="text-xs text-text-muted">
        Settings, integrations, household accounts, API keys and sign-in stay yours alone.
      </p>
    </fieldset>
  );
}
