"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewSeerrAction,
  seerrImportJobAction,
  startSeerrImportAction,
  testSeerrAction,
} from "@/app/settings/integrations/seerr-import-actions";
import type {
  SeerrImportChoices,
  SeerrImportJob,
  SeerrImportPreview,
  SeerrImportReport,
  SeerrImportWarning,
  SeerrServerInfo,
  SeerrUserPreview,
} from "@/lib/api/types";
import { permissionLabel, type Permission } from "@/lib/users/permissions";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translator";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const primaryButton =
  "rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";
const outlineButton =
  "rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

const POLL_MS = 1500;

/** A warning from the preview or the report, in the reader's words. */
export function seerrWarningText(t: Translator, warning: SeerrImportWarning): string {
  const count = warning.count ?? 0;
  switch (warning.code) {
    case "tmdb_not_configured":
      return t("integrations.seerrWarnTmdb");
    case "seerr_admin_is_you":
      return t("integrations.seerrWarnAdminIsYou");
    case "seerr_admins_trusted":
      return t("integrations.seerrWarnAdminsTrusted", { count });
    case "arr_server_unmatched":
      return t("integrations.seerrWarnServerUnmatched", { name: warning.detail ?? "" });
    case "requests_without_requester":
      return t("integrations.seerrWarnRequestsNoRequester", { count });
    case "issues_without_reporter":
      return t("integrations.seerrWarnIssuesNoReporter", { count });
    case "notifications_not_imported":
      return t("integrations.seerrWarnNotifications");
    case "local_users_no_password":
      return t("integrations.seerrWarnLocalNoPassword", { count });
    case "links_dropped":
      return t("integrations.seerrWarnLinksDropped", { count });
  }
}

function serverLabel(t: Translator, server: SeerrServerInfo): string {
  return t("integrations.seerrConnectedAs", {
    title: server.applicationTitle ?? "Seerr",
    version: server.version ?? "",
    name: server.adminName ?? "",
  });
}

function Warnings({ warnings }: { warnings: SeerrImportWarning[] }) {
  const t = useT();
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-bg-0 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{t("integrations.seerrWarningsHeading")}</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-text-secondary">
        {warnings.map((warning, i) => (
          <li key={`${warning.code}-${i}`}>{seerrWarningText(t, warning)}</li>
        ))}
      </ul>
    </div>
  );
}

function AccountRow({ item }: { item: SeerrUserPreview }) {
  const t = useT();
  const outcome =
    item.outcome === "you"
      ? t("integrations.seerrOutcomeYou")
      : item.outcome === "matched"
        ? t("integrations.seerrOutcomeMatched", { username: item.matchedTo ?? "" })
        : item.outcome === "imported"
          ? t("integrations.seerrOutcomeImported", { username: item.matchedTo ?? "" })
          : t("integrations.seerrOutcomeNew");
  const kind = item.kind === "plex" ? "Plex" : item.kind === "jellyfin" ? "Jellyfin" : t("integrations.seerrKindLocal");
  const limits =
    item.movieQuotaLimit || item.tvQuotaLimit
      ? t("integrations.seerrLimits", {
          movies: item.movieQuotaLimit ?? "∞",
          movieDays: item.movieQuotaDays,
          tv: item.tvQuotaLimit ?? "∞",
          tvDays: item.tvQuotaDays,
        })
      : null;
  return (
    <li className="flex flex-col gap-1 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-text-primary">
          {item.name}
          <span className="ml-2 text-xs text-text-muted">{kind}</span>
          {item.isAdmin && <span className="ml-2 text-xs text-text-muted">{t("integrations.seerrIsSeerrAdmin")}</span>}
        </span>
        <span className={`text-xs ${item.outcome === "new" ? "text-owned" : "text-text-muted"}`}>{outcome}</span>
      </div>
      {item.outcome !== "you" && (
        <p className="text-xs text-text-muted">
          {item.permissions.length > 0
            ? item.permissions.map((p) => permissionLabel(p as Permission, t)).join(" · ")
            : t("integrations.seerrNoPermissions")}
          {limits ? ` · ${limits}` : ""}
        </p>
      )}
    </li>
  );
}

function PreviewSummary({ preview }: { preview: SeerrImportPreview }) {
  const t = useT();
  const [showAccounts, setShowAccounts] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 text-sm text-text-primary">
        <li>{t("integrations.seerrUsersSummary", { total: preview.users.total, matched: preview.users.matched + preview.users.you, new: preview.users.new, imported: preview.users.imported })}</li>
        <li>
          {t("integrations.seerrRequestsSummary", {
            total: preview.requests.total,
            new: preview.requests.new,
            pending: preview.requests.pending,
            approved: preview.requests.approved,
            rejected: preview.requests.rejected,
            imported: preview.requests.imported,
          })}
          {preview.requests.fourK > 0 && <span className="ml-1 text-text-muted">{t("integrations.seerrFourKCount", { count: preview.requests.fourK })}</span>}
        </li>
        <li>{t("integrations.seerrIssuesSummary", { total: preview.issues.total, new: preview.issues.new, comments: preview.issues.comments, imported: preview.issues.imported })}</li>
        <li>{t("integrations.seerrBlocklistSummary", { total: preview.blocklist.total, new: preview.blocklist.new, imported: preview.blocklist.imported })}</li>
      </ul>

      {preview.users.items.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowAccounts((v) => !v)} className="text-xs text-accent hover:underline">
            {showAccounts ? t("integrations.seerrHideAccounts") : t("integrations.seerrShowAccounts")}
          </button>
          {showAccounts && (
            <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {preview.users.items.map((item) => (
                <AccountRow key={item.seerrId} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}

      {preview.requests.servers.length > 0 && (
        <div className="text-xs text-text-muted">
          <p className="font-medium uppercase tracking-wider">{t("integrations.seerrServersHeading")}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.requests.servers.map((server, i) => (
              <li key={`${server.kind}-${server.name}-${i}`}>
                {server.name} ({server.kind === "sonarr" ? "Sonarr" : "Radarr"}):{" "}
                {server.matchedTo ? t("integrations.seerrServerMatched", { name: server.matchedTo }) : t("integrations.seerrServerUnmatched")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Warnings warnings={preview.warnings} />
    </div>
  );
}

function ReportSummary({ report }: { report: SeerrImportReport }) {
  const t = useT();
  const download = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marquee-seerr-import-${report.finishedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-owned">{t("integrations.seerrDone")}</p>
      <ul className="flex flex-col gap-2 text-sm text-text-primary">
        {report.choices.users && (
          <li>{t("integrations.seerrReportUsers", { created: report.users.created.length, matched: report.users.matched.length, skipped: report.users.skipped.length })}</li>
        )}
        {report.choices.requests && (
          <li>{t("integrations.seerrReportRequests", { created: report.requests.created, skipped: report.requests.skipped, failed: report.requests.failed.length })}</li>
        )}
        {report.choices.issues && (
          <li>{t("integrations.seerrReportIssues", { created: report.issues.created, comments: report.issues.comments, skipped: report.issues.skipped, failed: report.issues.failed.length })}</li>
        )}
        {report.choices.blocklist && (
          <li>{t("integrations.seerrReportBlocklist", { created: report.blocklist.created, skipped: report.blocklist.skipped, failed: report.blocklist.failed.length })}</li>
        )}
      </ul>
      {report.users.created.length > 0 && (
        <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
          {report.users.created.map((user) => (
            <li key={user.seerrId} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="truncate text-text-primary">{user.name}</span>
              <span className="text-xs text-text-muted">{user.username}</span>
            </li>
          ))}
        </ul>
      )}
      <Warnings warnings={report.warnings} />
      <div>
        <button type="button" onClick={download} className={outlineButton}>
          {t("integrations.seerrDownloadReport")}
        </button>
      </div>
    </div>
  );
}

function phaseLabel(t: Translator, job: SeerrImportJob): string {
  const values = { done: job.done, total: job.total };
  switch (job.phase) {
    case "connecting":
      return t("integrations.seerrPhaseConnecting");
    case "users":
      return t("integrations.seerrPhaseUsers", values);
    case "requests":
      return t("integrations.seerrPhaseRequests", values);
    case "issues":
      return t("integrations.seerrPhaseIssues", values);
    case "blocklist":
      return t("integrations.seerrPhaseBlocklist", values);
    case "done":
      return t("integrations.seerrPhaseFinishing");
  }
}

/**
 * Settings › Integrations › Import from Seerr: connect (address + admin
 * API key, tested), preview what would come over, choose what to import,
 * run with progress, and a summary with a downloadable report. The key
 * stays in this component's state for the session and is sent with each
 * step; the server never stores it.
 */
export function SeerrImportWizard({ tmdbConfigured }: { tmdbConfigured: boolean }) {
  const t = useT();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [server, setServer] = useState<SeerrServerInfo | null>(null);
  const [preview, setPreview] = useState<SeerrImportPreview | null>(null);
  const [choices, setChoices] = useState<SeerrImportChoices>({
    users: true,
    updateExistingUsers: false,
    requests: tmdbConfigured,
    issues: tmdbConfigured,
    blocklist: true,
  });
  const [job, setJob] = useState<SeerrImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [starting, startRun] = useTransition();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = job?.state === "running";

  useEffect(() => {
    if (!job || job.state !== "running") return;
    let cancelled = false;
    const tick = async () => {
      const result = await seerrImportJobAction(job.id);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setJob({ ...job, state: "failed", error: result.error });
        return;
      }
      if (result.job) {
        setJob(result.job);
        if (result.job.state === "running") pollTimer.current = setTimeout(tick, POLL_MS);
        else router.refresh();
      }
    };
    pollTimer.current = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // Re-armed whenever a new job (id) starts; the poll itself updates `job`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.state]);

  function reset() {
    setServer(null);
    setPreview(null);
    setJob(null);
    setError(null);
  }

  function handleTest() {
    setError(null);
    startTest(async () => {
      const result = await testSeerrAction(url, apiKey);
      if (result.error) {
        setError(result.error);
        setServer(null);
        return;
      }
      setServer(result.server ?? null);
      setPreview(null);
    });
  }

  function handlePreview() {
    setError(null);
    startPreview(async () => {
      const result = await previewSeerrAction(url, apiKey);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(result.preview ?? null);
    });
  }

  function handleRun() {
    setError(null);
    startRun(async () => {
      const result = await startSeerrImportAction(url, apiKey, choices);
      if (result.error) {
        setError(result.error);
        return;
      }
      setJob(result.job ?? null);
    });
  }

  const nothingChosen = !choices.users && !choices.requests && !choices.issues && !choices.blocklist;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Connect */}
      <section className="rounded-2xl border border-border bg-bg-1 p-6">
        <h3 className="font-display text-lg text-text-primary">{t("integrations.seerrStepConnect")}</h3>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            {t("integrations.seerrUrlLabel")}
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                reset();
              }}
              placeholder="http://192.168.1.20:5055" // i18n-ignore
              disabled={running}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            {t("integrations.seerrApiKeyLabel")}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                reset();
              }}
              autoComplete="off"
              disabled={running}
              className={inputClass}
            />
            <span className="text-xs text-text-muted">{t("integrations.seerrApiKeyHint")}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleTest} disabled={testing || running || !url || !apiKey} className={server ? outlineButton : primaryButton}>
              {testing ? t("integrations.seerrTesting") : t("integrations.seerrTest")}
            </button>
            {server && <span className="text-sm text-owned">{serverLabel(t, server)}</span>}
          </div>
        </div>
      </section>

      {/* 2. Preview */}
      {server && (
        <section className="rounded-2xl border border-border bg-bg-1 p-6">
          <h3 className="font-display text-lg text-text-primary">{t("integrations.seerrStepPreview")}</h3>
          <p className="mt-1 text-xs text-text-muted">{t("integrations.seerrPreviewHint")}</p>
          <div className="mt-4 flex flex-col gap-4">
            {!preview && (
              <div>
                <button type="button" onClick={handlePreview} disabled={previewing || running} className={primaryButton}>
                  {previewing ? t("integrations.seerrPreviewing") : t("integrations.seerrPreviewButton")}
                </button>
              </div>
            )}
            {preview && <PreviewSummary preview={preview} />}
          </div>
        </section>
      )}

      {/* 3. Choose and run */}
      {preview && (
        <section className="rounded-2xl border border-border bg-bg-1 p-6">
          <h3 className="font-display text-lg text-text-primary">{t("integrations.seerrStepRun")}</h3>
          {!job && (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={choices.users} onChange={(e) => setChoices({ ...choices, users: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
                <span>
                  {t("integrations.seerrChooseUsers")}
                  <span className="mt-0.5 block text-xs text-text-muted">{t("integrations.seerrChooseUsersHelp")}</span>
                </span>
              </label>
              <label className="ml-6 flex items-start gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={choices.updateExistingUsers}
                  disabled={!choices.users}
                  onChange={(e) => setChoices({ ...choices, updateExistingUsers: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>{t("integrations.seerrChooseUpdateExisting")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={choices.requests}
                  disabled={!preview.tmdbConfigured}
                  onChange={(e) => setChoices({ ...choices, requests: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>
                  {t("integrations.seerrChooseRequests")}
                  <span className="mt-0.5 block text-xs text-text-muted">{t("integrations.seerrChooseRequestsHelp")}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={choices.issues}
                  disabled={!preview.tmdbConfigured}
                  onChange={(e) => setChoices({ ...choices, issues: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>{t("integrations.seerrChooseIssues")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={choices.blocklist} onChange={(e) => setChoices({ ...choices, blocklist: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
                <span>{t("integrations.seerrChooseBlocklist")}</span>
              </label>
              <div className="mt-2">
                <button type="button" onClick={handleRun} disabled={starting || nothingChosen} className={primaryButton}>
                  {starting ? t("integrations.seerrStarting") : t("integrations.seerrRun")}
                </button>
              </div>
            </div>
          )}
          {job && job.state === "running" && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-sm text-text-primary">{phaseLabel(t, job)}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-2">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: job.total > 0 ? `${Math.round((job.done / job.total) * 100)}%` : "8%" }}
                />
              </div>
              <p className="text-xs text-text-muted">{t("integrations.seerrRunningHint")}</p>
            </div>
          )}
          {job && job.state === "failed" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-red-400">{t("integrations.seerrFailed", { error: job.error ?? "" })}</p>
              <div>
                <button type="button" onClick={() => setJob(null)} className={outlineButton}>
                  {t("integrations.seerrTryAgain")}
                </button>
              </div>
            </div>
          )}
          {job && job.state === "done" && job.report && (
            <div className="mt-4">
              <ReportSummary report={job.report} />
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
