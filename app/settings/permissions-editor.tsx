"use client";

import { useState } from "react";
import {
  normalizePermissions,
  PERMISSION_GROUPS,
  PERMISSION_PRESET_LABELS,
  presetFor,
  presetPermissions,
  type Permission,
} from "@/lib/users/permissions";
import { useT } from "@/lib/i18n/client";

// The admin's per-member switches (lib/users/permissions.ts), grouped, with
// a preset picker on top that fills them in — and reads "Custom" as soon as
// they differ from both presets. Sent with the member edit form as
// `perm:<name>` checkboxes plus `permissionsForm=1`; the server works the
// role out from them.

export function PermissionsEditor({ initial }: { initial: string[] }) {
  const t = useT();
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
        {t("settings.permWhatTheyCanDo")}
        <select
          value={preset === "admin" ? "custom" : preset}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "member" || value === "trusted") setGranted(new Set(presetPermissions(value)));
          }}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        >
          <option value="member">{t("settings.presetMemberOption")}</option>
          <option value="trusted">{t("settings.presetTrustedOption")}</option>
          <option value="custom" disabled={preset !== "custom"}>
            {t(PERMISSION_PRESET_LABELS.custom)}
          </option>
        </select>
      </label>

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t(group.title)}</p>
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
                  <span className="text-text-primary">{t(item.label)}</span>
                  <span className="block text-xs text-text-muted">
                    {locked ? t("settings.permComesWithReviewing") : t(item.description)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ))}
      <p className="text-xs text-text-muted">{t("settings.permAdminOnlyNote")}</p>
    </fieldset>
  );
}
