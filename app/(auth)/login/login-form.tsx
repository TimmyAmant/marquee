"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translator";
import { PUSH_PROMPT_DISMISSED_KEY } from "@/lib/push/browser";
import { clearSearchHistory } from "@/lib/search/recent";
import {
  jellyfinLoginAction,
  loginAction,
  pollPlexSignInAction,
  pollQuickConnectAction,
  startPlexSignInAction,
  startQuickConnectAction,
  type PlexSignInStart,
} from "./actions";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";
const secondaryButtonClass =
  "rounded-full border border-border-strong px-4 py-2.5 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

/** How often the page asks whether the Plex tab has been approved, and for
 * how long (the server forgets a Plex sign-in after 10 minutes). */
const PLEX_POLL_MS = 2000;
const PLEX_TIMEOUT_MS = 10 * 60 * 1000;

// A fresh sign-in asks about notifications again, even if "Not now" was
// picked last time (components/push-prompt.tsx), and starts with no recent
// searches (whoever used this browser before may not have signed out).
function prepareSignIn() {
  try {
    localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
  } catch {
    // Private mode: nothing was stored.
  }
  clearSearchHistory();
}

function RememberCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  const t = useT();
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      <input
        type="checkbox"
        name="remember"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-bg-0 accent-accent"
      />
      {t("auth.rememberMe")}
    </label>
  );
}

function PasswordForm({ remember, setRemember }: { remember: boolean; setRemember: (v: boolean) => void }) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(loginAction, undefined);
  return (
    <form action={formAction} onSubmit={prepareSignIn} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("auth.username")}
        <input type="text" name="username" required autoComplete="username" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("auth.password")}
        <input type="password" name="password" required autoComplete="current-password" className={inputClass} />
      </label>

      <RememberCheckbox checked={remember} onChange={setRemember} />

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? t("auth.signingIn") : t("auth.signIn")}
      </button>
    </form>
  );
}

/** Jellyfin's Quick Connect: shows a code to approve in a Jellyfin app the
 * person is already signed in to, and signs in once they have (the server
 * asks Jellyfin; this page only polls). */
function QuickConnectPanel({ remember, onCancel }: { remember: boolean; onCancel: () => void }) {
  const t = useT();
  // For the messages set from inside the polling loop, which starts once.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read at sign-in time, so ticking the box doesn't start over.
  const rememberRef = useRef(remember);
  useEffect(() => {
    rememberRef.current = remember;
  }, [remember]);

  useEffect(() => {
    // Per run of this effect, not a shared ref: under StrictMode (and on any
    // remount) the first run's loop must stop for good rather than carry on
    // beside the second's once the flag is reset.
    let cancelled = false;
    (async () => {
      const started = await startQuickConnectAction();
      if (cancelled) return;
      if (!started.handle || !started.code) {
        setError(started.error ?? tRef.current("auth.quickConnectStartFailed"));
        return;
      }
      setCode(started.code);
      prepareSignIn();
      const deadline = Date.now() + PLEX_TIMEOUT_MS;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, PLEX_POLL_MS));
        if (cancelled) return;
        // On approval the action signs in and redirects.
        const poll = await pollQuickConnectAction(started.handle, rememberRef.current);
        if (cancelled) return;
        if (poll.status === "error") {
          setError(poll.error);
          setCode(null);
          return;
        }
      }
      if (!cancelled) {
        setError(tRef.current("auth.quickConnectTimedOut"));
        setCode(null);
      }
    })().catch((err) => {
      // Approval ends in redirect(), which the router has to get.
      unstable_rethrow(err);
      if (!cancelled) setError(tRef.current("auth.quickConnectStartFailed"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-0 p-4 text-sm">
      {code ? (
        <>
          <p className="text-text-secondary">{t("auth.quickConnectInstructions")}</p>
          <p className="text-center font-mono text-3xl tracking-[0.3em] text-text-primary" aria-live="polite">
            {code}
          </p>
          <p className="text-xs text-text-muted">{t("auth.waitingForApproval")}</p>
        </>
      ) : (
        !error && <p className="text-text-secondary">{t("auth.gettingCode")}</p>
      )}
      {error && <p className="text-red-400">{error}</p>}
      <button type="button" onClick={onCancel} className="self-start text-text-secondary hover:text-accent">
        {error ? t("common.back") : t("common.cancel")}
      </button>
    </div>
  );
}

/** The same fields, checked against the admin's Jellyfin server instead. */
function JellyfinForm({
  name,
  quickConnect,
  remember,
  setRemember,
  onCancel,
}: {
  /** "Jellyfin", or "Emby" when that's what the server is. */
  name: string;
  /** Offer "Use Quick Connect" (Jellyfin only). */
  quickConnect: boolean;
  remember: boolean;
  setRemember: (v: boolean) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [state, formAction, isPending] = useActionState(jellyfinLoginAction, undefined);
  const [usingQuickConnect, setUsingQuickConnect] = useState(false);
  if (usingQuickConnect) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <QuickConnectPanel remember={remember} onCancel={() => setUsingQuickConnect(false)} />
        <RememberCheckbox checked={remember} onChange={setRemember} />
      </div>
    );
  }
  return (
    <form action={formAction} onSubmit={prepareSignIn} className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-text-secondary">{t("auth.mediaServerHint", { name })}</p>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("auth.mediaServerUsername", { name })}
        <input type="text" name="username" required autoComplete="username" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("auth.mediaServerPassword", { name })}
        <input type="password" name="password" required autoComplete="current-password" className={inputClass} />
      </label>

      <RememberCheckbox checked={remember} onChange={setRemember} />

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? t("auth.signingIn") : t("auth.signInWith", { name })}
      </button>
      {quickConnect && (
        <button type="button" onClick={() => setUsingQuickConnect(true)} className={secondaryButtonClass}>
          {t("auth.useQuickConnect")}
        </button>
      )}
      <button type="button" onClick={onCancel} className="text-sm text-text-secondary hover:text-accent">
        {t("auth.useMarqueePassword")}
      </button>
    </form>
  );
}

/** Opens plex.tv in a new tab and waits for the person to approve there;
 * the server does the rest (lib/auth/media-signin.ts) and this page
 * navigates home once it has signed in. */
function PlexButton({ remember }: { remember: boolean }) {
  const t = useT();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which sign-in attempt is current: each click takes the next number, and
  // Cancel or leaving the page moves it on, so an older attempt's loop
  // (still waiting on a poll) sees it's stale after every await and stops
  // instead of running beside the new one or putting its error over it.
  const attemptRef = useRef(0);

  function cancelAttempt() {
    attemptRef.current++;
  }

  useEffect(() => cancelAttempt, []);

  async function handleClick() {
    setError(null);
    setWaiting(true);
    const attempt = ++attemptRef.current;
    const stale = () => attempt !== attemptRef.current;
    // Opened before the first await: a tab opened later than the click is
    // blocked as a pop-up. It's pointed at plex.tv once the server answers.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;

    const started = await startPlexSignInAction().catch((): PlexSignInStart => ({}));
    if (stale()) {
      tab?.close();
      return;
    }
    if (!started.handle || !started.authUrl) {
      tab?.close();
      setError(started.error ?? t("auth.plexStartFailed"));
      setWaiting(false);
      return;
    }
    if (tab) tab.location.href = started.authUrl;
    else window.open(started.authUrl, "_blank", "noopener,noreferrer");

    prepareSignIn();
    const deadline = Date.now() + PLEX_TIMEOUT_MS;
    while (!stale() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, PLEX_POLL_MS));
      if (stale()) return;
      // On success the action signs in and redirects, so this only ever
      // comes back pending or with an error.
      const poll = await pollPlexSignInAction(started.handle, remember).catch((err) => {
        // Success ends in redirect(), which the router has to get.
        unstable_rethrow(err);
        return null;
      });
      if (stale()) return;
      // A dropped connection: try again on the next tick.
      if (!poll) continue;
      if (poll.status === "error") {
        setError(poll.error);
        setWaiting(false);
        return;
      }
    }
    if (!stale()) {
      setError(t("auth.plexTimedOut"));
      setWaiting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {waiting ? (
        <div className="flex items-center justify-between gap-3 rounded-full border border-border-strong px-4 py-2.5 text-sm text-text-secondary">
          <span>{t("auth.plexWaiting")}</span>
          <button
            type="button"
            onClick={() => {
              cancelAttempt();
              setWaiting(false);
            }}
            className="text-text-secondary hover:text-accent"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={handleClick} className={secondaryButtonClass}>
          {t("auth.signInWith", { name: "Plex" })}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

type Methods = {
  plex: boolean;
  jellyfin: boolean;
  jellyfinName: string;
  signup: boolean;
  quickConnect: boolean;
  sso: { name: string; signup: boolean } | null;
};

/** "Plex", "Jellyfin", "Plex (or Emby)", "Authentik (or Plex)"… — the
 * sign-ins that make new accounts, for the sign-up line. Null when none do. */
function signupMethodNames(methods: Methods, t: Translator): string | null {
  const names: string[] = [];
  if (methods.sso?.signup) names.push(methods.sso.name);
  if (methods.signup && methods.plex) names.push("Plex");
  if (methods.signup && methods.jellyfin) names.push(methods.jellyfinName);
  if (names.length === 0) return null;
  const [first, ...rest] = names;
  if (rest.length === 0) return first;
  // "Plex or Jellyfin" in the page's language.
  const others = new Intl.ListFormat(t.tag, { type: "disjunction" }).format(rest);
  return t("auth.signupNamesAlternatives", { first, rest: others });
}

/** "Sign in with <SSO>": a plain link to the server, which sends the
 * browser on to the identity provider and back (app/api/auth/sso). */
function SsoButton({ name, remember }: { name: string; remember: boolean }) {
  const t = useT();
  return (
    <a
      href={`/api/auth/sso/start${remember ? "?remember=1" : ""}`}
      onClick={prepareSignIn}
      className={`${secondaryButtonClass} text-center`}
    >
      {t("auth.signInWith", { name })}
    </a>
  );
}

export function LoginForm({ methods, ssoError }: { methods: Methods; ssoError: string | null }) {
  const t = useT();
  const [mode, setMode] = useState<"password" | "jellyfin">("password");
  const [remember, setRemember] = useState(true);
  // The other ways in, under an "or": SSO and Plex always, Jellyfin unless
  // its form is the one showing (then "Use a Marquee password instead" is
  // the way back).
  const hasOtherMethods = Boolean(methods.sso) || methods.plex || (methods.jellyfin && mode !== "jellyfin");
  // With new accounts from Plex/Jellyfin/SSO sign-in on, that's how a
  // newcomer gets in — there's no other sign-up.
  const signupNames = signupMethodNames(methods, t);

  return (
    <div className="rounded-2xl border border-border bg-bg-1 p-8">
      <h1 className="font-display text-2xl text-text-primary">{t("auth.welcomeBack")}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t("auth.signInSubtitle")}</p>

      {ssoError && <p className="mt-4 text-sm text-red-400">{ssoError}</p>}

      {mode === "jellyfin" && methods.jellyfin ? (
        <JellyfinForm
          name={methods.jellyfinName}
          quickConnect={methods.quickConnect}
          remember={remember}
          setRemember={setRemember}
          onCancel={() => setMode("password")}
        />
      ) : (
        <PasswordForm remember={remember} setRemember={setRemember} />
      )}

      {hasOtherMethods && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            {t("common.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-3">
            {methods.sso && <SsoButton name={methods.sso.name} remember={remember} />}
            {methods.plex && <PlexButton remember={remember} />}
            {methods.jellyfin && mode !== "jellyfin" && (
              <button type="button" onClick={() => setMode("jellyfin")} className={secondaryButtonClass}>
                {t("auth.signInWith", { name: methods.jellyfinName })}
              </button>
            )}
          </div>
        </>
      )}

      {signupNames && (
        <p className="mt-4 text-center text-sm text-text-secondary">
          {t("auth.signupHint", { names: signupNames })}
        </p>
      )}
    </div>
  );
}
