"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockRuleAction, previewBlockRuleAction, removeBlocklistEntryAction } from "@/lib/requests/blocklist-actions";
import type { BlockPreview } from "@/lib/requests/blocklist";
import type { BlocklistEntry } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";
import { regionName } from "@/lib/i18n/format";
import { STREAMING_REGIONS } from "@/lib/discover/locale";
import { showToast } from "@/components/toast";
import {
  SETTINGS_INPUT,
  SETTINGS_SECONDARY_BUTTON,
  SaveBar,
  SettingRow,
  SettingsGroup,
  SettingsGroupHeader,
} from "@/components/settings/settings-ui";
import { orError } from "@/lib/async/or-error";

/** Common ratings, offered as suggestions (any rating can be typed). */
const RATING_SUGGESTIONS = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA", "12", "16", "18"];

function RemoveButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await orError(removeBlocklistEntryAction(id), t("common.somethingWentWrong"));
          setBusy(false);
          if (result.error) setError(result.error);
          else router.refresh();
        }}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
      >
        {busy ? t("settings.removing") : t("common.remove")}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}

function EntryLabel({ entry }: { entry: BlocklistEntry }) {
  const t = useT();
  const bold = (chunks: React.ReactNode) => <span className="font-medium">{chunks}</span>;
  if (entry.kind === "title" && entry.mediaType && entry.tmdbId) {
    return (
      <Link href={`/title/${entry.mediaType}/${entry.tmdbId}`} className="text-text-primary hover:text-accent">
        {entry.title ?? `#${entry.tmdbId}`}
      </Link>
    );
  }
  if (entry.kind === "certification") {
    return (
      <span className="text-text-primary">
        {rich(
          t("settings.blocklistCertification", {
            rating: entry.keyword ?? "",
            region: regionName(t, entry.region) ?? entry.region ?? "",
          }),
          { b: bold },
        )}
      </span>
    );
  }
  if (entry.kind === "adult") return <span className="font-medium text-text-primary">{t("settings.blocklistAdult")}</span>;
  return <span className="text-text-primary">{rich(t("settings.blocklistKeyword", { keyword: entry.keyword ?? "" }), { b: bold })}</span>;
}

/** Settings › Blocklist: what nobody may request — titles blocked from their
 * page, and the automatic rules added here. */
export function BlocklistSettings({ entries }: { entries: BlocklistEntry[] }) {
  const t = useT();
  return entries.length === 0 ? (
    <p className="px-5 py-4 text-sm text-text-muted">{t("settings.blocklistEmpty")}</p>
  ) : (
    <ul className="divide-y divide-border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
          <div className="min-w-0">
            <EntryLabel entry={entry} />
            {entry.reason && <p className="mt-0.5 truncate text-xs text-text-muted">{entry.reason}</p>}
          </div>
          <RemoveButton id={entry.id} />
        </li>
      ))}
    </ul>
  );
}

type RuleKind = "keyword" | "certification" | "adult";

/** "Block automatically": a keyword or genre, a rating in a country, or
 * TMDb's adult titles — with a preview of what it would catch before it's
 * added. */
export function AutoBlockForm({ defaultRegion, adultBlocked }: { defaultRegion: string; adultBlocked: boolean }) {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<RuleKind>("keyword");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState(defaultRegion);
  const [certification, setCertification] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isPreviewing, startPreview] = useTransition();

  const body = { kind, keyword, region, certification, reason };
  const ready = kind === "adult" ? !adultBlocked : kind === "keyword" ? Boolean(keyword.trim()) : Boolean(certification.trim());

  function change(next: Partial<{ kind: RuleKind; keyword: string; region: string; certification: string }>) {
    setPreview(null);
    if (next.kind !== undefined) setKind(next.kind);
    if (next.keyword !== undefined) setKeyword(next.keyword);
    if (next.region !== undefined) setRegion(next.region);
    if (next.certification !== undefined) setCertification(next.certification);
  }

  function runPreview() {
    startPreview(async () => {
      const result = await orError(previewBlockRuleAction(body), t("common.somethingWentWrong"));
      if (result.error || !result.preview) showToast(result.error ?? t("common.somethingWentWrong"), "error");
      else setPreview(result.preview);
    });
  }

  function save() {
    startSaving(async () => {
      const result = await orError(blockRuleAction(body), t("common.somethingWentWrong"));
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      showToast(t("settings.blockRuleAdded"));
      setKeyword("");
      setCertification("");
      setReason("");
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <SettingsGroup>
      <SettingsGroupHeader title={t("settings.autoBlockTitle")} description={t("settings.autoBlockHelp")} />
      <SettingRow label={t("settings.autoBlockKind")} htmlFor="block-kind">
        <select
          id="block-kind"
          value={kind}
          onChange={(e) => change({ kind: e.target.value as RuleKind })}
          className={`${SETTINGS_INPUT} sm:w-64`}
        >
          <option value="keyword">{t("settings.autoBlockKeyword")}</option>
          <option value="certification">{t("settings.autoBlockCertification")}</option>
          <option value="adult">{t("settings.autoBlockAdult")}</option>
        </select>
      </SettingRow>
      {kind === "keyword" && (
        <SettingRow label={t("settings.blockKeywordLabel")} help={t("settings.blockKeywordHelp")} htmlFor="block-keyword">
          <input
            id="block-keyword"
            value={keyword}
            onChange={(e) => change({ keyword: e.target.value })}
            placeholder={t("settings.blockKeywordPlaceholder")}
            className={`${SETTINGS_INPUT} sm:w-64`}
          />
        </SettingRow>
      )}
      {kind === "certification" && (
        <>
          <SettingRow label={t("settings.autoBlockRegion")} htmlFor="block-region">
            <select
              id="block-region"
              value={region}
              onChange={(e) => change({ region: e.target.value })}
              className={`${SETTINGS_INPUT} sm:w-64`}
            >
              {STREAMING_REGIONS.map((code) => (
                <option key={code} value={code}>
                  {regionName(t, code) ?? code}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label={t("settings.autoBlockRating")} help={t("settings.autoBlockRatingHelp")} htmlFor="block-rating">
            <input
              id="block-rating"
              list="block-rating-suggestions"
              value={certification}
              onChange={(e) => change({ certification: e.target.value })}
              placeholder={RATING_SUGGESTIONS[4]}
              className={`${SETTINGS_INPUT} sm:w-64`}
            />
            <datalist id="block-rating-suggestions">
              {RATING_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </SettingRow>
        </>
      )}
      {kind === "adult" && (
        <SettingRow
          label={t("settings.autoBlockAdult")}
          help={adultBlocked ? t("settings.autoBlockAdultOn") : t("settings.autoBlockAdultHelp")}
        />
      )}
      <SettingRow label={t("settings.blockReasonLabel")} htmlFor="block-reason">
        <input
          id="block-reason"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          className={`${SETTINGS_INPUT} sm:w-64`}
        />
      </SettingRow>
      {preview && (
        <div className="px-5 py-4 text-sm">
          <p className="font-medium text-text-primary">
            {t("settings.blockPreviewSummary", { matched: preview.matched, scanned: preview.scanned })}
          </p>
          {preview.titles.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {preview.titles.map((title) => (
                <li key={`${title.mediaType}:${title.tmdbId}`}>
                  <Link
                    href={`/title/${title.mediaType}/${title.tmdbId}`}
                    className="inline-block rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
                  >
                    {title.year ? `${title.name} (${title.year})` : title.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {preview.pendingRequests.length > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              {t("settings.blockPreviewPending", { count: preview.pendingRequests.length })}
            </p>
          )}
        </div>
      )}
      <SaveBar
        label={t("settings.block")}
        pendingLabel={t("settings.blocking")}
        pending={isSaving}
        disabled={!ready}
        onClick={save}
        secondary={
          <button type="button" onClick={runPreview} disabled={!ready || isPreviewing} className={SETTINGS_SECONDARY_BUTTON}>
            {isPreviewing ? t("settings.blockPreviewing") : t("settings.blockPreview")}
          </button>
        }
      />
    </SettingsGroup>
  );
}
