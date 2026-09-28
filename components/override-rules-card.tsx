"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteOverrideRuleAction,
  saveOverrideRuleAction,
  searchRuleKeywordsAction,
} from "@/app/settings/integrations/override-rule-actions";
import { getArrServerOptionsAction } from "@/app/settings/integrations/arr-server-actions";
import { TagChips } from "@/components/arr-servers-card";
import { showToast } from "@/components/toast";
import {
  AddTile,
  SETTINGS_INPUT,
  SETTINGS_SECONDARY_BUTTON,
  SaveBar,
  ServiceTile,
  SettingRow,
  SettingsGroup,
  SettingsGroupHeader,
  SettingsSection,
  TILE_BUTTON,
} from "@/components/settings/settings-ui";
import type { OverrideRule } from "@/lib/arr/override-rules";
import type { ArrPickerOptions } from "@/lib/arr/add-options-server";
import { DISCOVER_LANGUAGES } from "@/lib/discover/locale";
import { languageName } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/client";

// Settings › Services › Override rules (lib/arr/override-rules.ts): a tile
// per rule saying where matching requests go and when, an Add tile, and the
// rule being edited as rows under them with one Save bar.

export type RuleServerOption = { id: string; name: string; kind: "sonarr" | "radarr"; is4k: boolean };
export type RuleMember = { id: string; name: string };
export type RuleGenres = { movie: { id: number; name: string }[]; tv: { id: number; name: string }[] };

type Draft = Omit<OverrideRule, "id" | "position">;

function blank(servers: RuleServerOption[]): Draft {
  return {
    serverId: servers[0]?.id ?? "",
    name: "",
    enabled: true,
    genres: [],
    languages: [],
    keywords: [],
    userIds: [],
    qualityProfileId: null,
    rootFolderPath: null,
    tags: null,
  };
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        on ? "border-accent bg-accent/15 text-accent" : "border-border-strong text-text-secondary hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function serverLabel(server: RuleServerOption | undefined): string {
  if (!server) return "";
  const kind = server.kind === "sonarr" ? "Sonarr" : "Radarr";
  return `${server.name} · ${server.is4k ? `4K ${kind}` : kind}`;
}

function RuleEditor({
  rule,
  servers,
  members,
  genres,
  onDone,
}: {
  rule: OverrideRule | null;
  servers: RuleServerOption[];
  members: RuleMember[];
  genres: RuleGenres;
  onDone: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => (rule ? { ...rule } : blank(servers)));
  const [options, setOptions] = useState<ArrPickerOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [isSaving, startSaving] = useTransition();
  const server = servers.find((s) => s.id === draft.serverId);
  const genreList = server?.kind === "sonarr" ? genres.tv : genres.movie;

  // The chosen server's profiles, folders and tags, asked when it changes.
  useEffect(() => {
    if (!draft.serverId) return;
    let live = true;
    getArrServerOptionsAction(draft.serverId)
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setOptions(result);
          setOptionsError(null);
        } else {
          setOptions(null);
          setOptionsError(result.error);
        }
      })
      .catch(() => live && setOptionsError(t("common.somethingWentWrong")));
    return () => {
      live = false;
    };
  }, [draft.serverId, t]);

  async function search(event: React.FormEvent | React.KeyboardEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setFound(await searchRuleKeywordsAction(query).catch(() => []));
  }

  function save() {
    startSaving(async () => {
      const result = await saveOverrideRuleAction(rule?.id ?? null, draft);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(t("integrations.ruleSaved"));
      onDone();
      router.refresh();
    });
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="mt-4">
      <SettingsGroup>
        <SettingsGroupHeader
          title={rule ? t("integrations.editRule") : t("integrations.addRule")}
          description={t("integrations.ruleEditorHelp")}
        />
        <SettingRow label={t("integrations.ruleName")} htmlFor="rule-name">
          <input
            id="rule-name"
            value={draft.name}
            maxLength={80}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t("integrations.ruleNamePlaceholder")}
            className={`${SETTINGS_INPUT} sm:w-72`}
          />
        </SettingRow>
        <SettingRow label={t("integrations.ruleServer")} help={t("integrations.ruleServerHelp")} htmlFor="rule-server">
          <select
            id="rule-server"
            value={draft.serverId}
            onChange={(e) => set({ serverId: e.target.value, qualityProfileId: null, rootFolderPath: null, tags: null, genres: [] })}
            className={`${SETTINGS_INPUT} sm:w-72`}
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {serverLabel(s)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label={t("integrations.ruleGenres")} help={t("integrations.ruleAnyHelp")} wideControl>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {genreList.length === 0 && <span className="text-xs text-text-muted">{t("integrations.ruleGenresUnavailable")}</span>}
            {genreList.map((g) => (
              <Chip key={g.id} on={draft.genres.includes(g.id)} onClick={() => set({ genres: toggle(draft.genres, g.id) })}>
                {g.name}
              </Chip>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("integrations.ruleLanguages")} help={t("integrations.ruleAnyHelp")} wideControl>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {DISCOVER_LANGUAGES.map((code) => (
              <Chip key={code} on={draft.languages.includes(code)} onClick={() => set({ languages: toggle(draft.languages, code) })}>
                {languageName(t, code)}
              </Chip>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("integrations.ruleKeywords")} help={t("integrations.ruleKeywordsHelp")} wideControl>
          <div className="flex w-full flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search(e);
                }}
                placeholder={t("integrations.ruleKeywordSearch")}
                aria-label={t("integrations.ruleKeywordSearch")}
                className={SETTINGS_INPUT}
              />
              <button type="button" onClick={(e) => void search(e)} className={SETTINGS_SECONDARY_BUTTON}>
                {t("common.search")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.keywords.map((k) => (
                <Chip key={k.id} on onClick={() => set({ keywords: draft.keywords.filter((x) => x.id !== k.id) })}>
                  {k.name} ×
                </Chip>
              ))}
              {found
                .filter((k) => !draft.keywords.some((x) => x.id === k.id))
                .slice(0, 12)
                .map((k) => (
                  <Chip key={k.id} on={false} onClick={() => set({ keywords: [...draft.keywords, k] })}>
                    + {k.name}
                  </Chip>
                ))}
            </div>
          </div>
        </SettingRow>
        <SettingRow label={t("integrations.ruleMembers")} help={t("integrations.ruleMembersHelp")} wideControl>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {members.map((m) => (
              <Chip key={m.id} on={draft.userIds.includes(m.id)} onClick={() => set({ userIds: toggle(draft.userIds, m.id) })}>
                {m.name}
              </Chip>
            ))}
          </div>
        </SettingRow>
        {optionsError && (
          <SettingRow label={t("integrations.ruleServerUnreachable")} help={optionsError} />
        )}
        <SettingRow label={t("title.qualityProfile")} htmlFor="rule-profile">
          <select
            id="rule-profile"
            value={draft.qualityProfileId ?? ""}
            onChange={(e) => set({ qualityProfileId: e.target.value ? Number(e.target.value) : null })}
            className={`${SETTINGS_INPUT} sm:w-72`}
          >
            <option value="">{t("integrations.ruleKeepDefault")}</option>
            {options?.qualityProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {draft.qualityProfileId && !options?.qualityProfiles.some((p) => p.id === draft.qualityProfileId) && (
              <option value={draft.qualityProfileId}>#{draft.qualityProfileId}</option>
            )}
          </select>
        </SettingRow>
        <SettingRow label={t("title.rootFolder")} htmlFor="rule-folder">
          <select
            id="rule-folder"
            value={draft.rootFolderPath ?? ""}
            onChange={(e) => set({ rootFolderPath: e.target.value || null })}
            className={`${SETTINGS_INPUT} sm:w-72`}
          >
            <option value="">{t("integrations.ruleKeepDefault")}</option>
            {options?.rootFolders.map((f) => (
              <option key={f.id} value={f.path}>
                {f.path}
              </option>
            ))}
            {draft.rootFolderPath && !options?.rootFolders.some((f) => f.path === draft.rootFolderPath) && (
              <option value={draft.rootFolderPath}>{draft.rootFolderPath}</option>
            )}
          </select>
        </SettingRow>
        <SettingRow label={t("title.tags")} help={t("integrations.ruleTagsHelp")} wideControl>
          {options ? (
            <TagChips
              tags={options.tags}
              selected={draft.tags ?? []}
              onChange={(tags) => set({ tags: tags.length > 0 ? tags : null })}
            />
          ) : (
            <span className="text-xs text-text-muted">{t("title.loadingServers")}</span>
          )}
        </SettingRow>
        <SettingRow label={t("integrations.ruleEnabled")} labelId="rule-enabled">
          <input
            type="checkbox"
            aria-labelledby="rule-enabled"
            checked={draft.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </SettingRow>
        <SaveBar
          label={rule ? t("common.save") : t("integrations.addRule")}
          pendingLabel={t("common.saving")}
          pending={isSaving}
          disabled={!draft.name.trim() || !draft.serverId}
          onClick={save}
          secondary={
            <button type="button" onClick={onDone} className={SETTINGS_SECONDARY_BUTTON}>
              {t("common.cancel")}
            </button>
          }
        />
      </SettingsGroup>
    </div>
  );
}

function RuleTile({
  rule,
  servers,
  members,
  genres,
  editing,
  onEdit,
}: {
  rule: OverrideRule;
  servers: RuleServerOption[];
  members: RuleMember[];
  genres: RuleGenres;
  editing: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const server = servers.find((s) => s.id === rule.serverId);
  const genreNames = new Map([...genres.movie, ...genres.tv].map((g) => [g.id, g.name]));
  const conditions = [
    ...rule.genres.map((id) => genreNames.get(id) ?? `#${id}`),
    ...rule.languages.map((code) => languageName(t, code) ?? code),
    ...rule.keywords.map((k) => k.name),
    ...rule.userIds.map((id) => members.find((m) => m.id === id)?.name ?? t("integrations.ruleFormerMember")),
  ];

  function remove() {
    startTransition(async () => {
      const result = await deleteOverrideRuleAction(rule.id);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(t("integrations.ruleRemoved"));
      router.refresh();
    });
  }

  return (
    <ServiceTile
      title={rule.name}
      address={t("integrations.ruleGoesTo", { server: serverLabel(server) })}
      status={{ ok: rule.enabled, label: rule.enabled ? t("integrations.ruleOn") : t("integrations.ruleOff") }}
      highlighted={editing}
      badges={
        conditions.length === 0 ? (
          <span className="text-xs text-text-muted">{t("integrations.ruleEveryRequest")}</span>
        ) : (
          conditions.map((c, i) => (
            <span key={`${c}-${i}`} className="rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-text-secondary">
              {c}
            </span>
          ))
        )
      }
      actions={
        confirming ? (
          <>
            <span className="text-xs text-text-secondary">{t("integrations.ruleRemoveConfirm", { name: rule.name })}</span>
            <button type="button" disabled={isPending} onClick={remove} className={`${TILE_BUTTON} text-red-400`}>
              {t("common.remove")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={TILE_BUTTON}>
              {t("integrations.keep")}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit} disabled={editing} className={TILE_BUTTON}>
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ml-auto text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
            >
              {t("common.remove")}
            </button>
          </>
        )
      }
    />
  );
}

/** The Override rules section of Settings › Services. */
export function OverrideRulesCard({
  rules,
  servers,
  members,
  genres,
}: {
  rules: OverrideRule[];
  servers: RuleServerOption[];
  members: RuleMember[];
  genres: RuleGenres;
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const editingRule = rules.find((r) => r.id === editing) ?? null;
  return (
    <SettingsSection title={t("integrations.overrideRules")} description={t("integrations.overrideRulesIntro")} id="override-rules">
      {servers.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("integrations.ruleNeedsServer")}</p>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule) => (
              <RuleTile
                key={rule.id}
                rule={rule}
                servers={servers}
                members={members}
                genres={genres}
                editing={editing === rule.id}
                onEdit={() => setEditing(rule.id)}
              />
            ))}
            <AddTile label={t("integrations.addRule")} onClick={() => setEditing("new")} active={editing === "new"} />
          </ul>
          {editingRule && (
            <RuleEditor
              key={editingRule.id}
              rule={editingRule}
              servers={servers}
              members={members}
              genres={genres}
              onDone={() => setEditing(null)}
            />
          )}
          {editing === "new" && (
            <RuleEditor rule={null} servers={servers} members={members} genres={genres} onDone={() => setEditing(null)} />
          )}
        </>
      )}
    </SettingsSection>
  );
}
