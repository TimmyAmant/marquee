// Settings' building blocks, the same on every tab (and in the Mac and
// Windows apps' SettingsRow / SettingsSection): a page heading with one
// line under it, sections with a title and dividers between their rows,
// and rows with the label and a short help text on the left and the
// control on the right — stacked on a phone. No hooks, so server and
// client components both use them.

export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Beside the heading on a wide window, under it on a phone. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-2xl text-text-primary">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

/** A group of settings under a title. Its children are usually a
 * `SettingsGroup` of rows, or a service's own card. */
export function SettingsSection({
  title,
  description,
  children,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-9 scroll-mt-24">
      {title && <h3 className="text-base font-semibold text-text-primary">{title}</h3>}
      {description && <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>}
      <div className={title || description ? "mt-4 flex flex-col gap-4" : "flex flex-col gap-4"}>{children}</div>
    </section>
  );
}

/** Rows in one card, a hairline between each. */
export function SettingsGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-1">{children}</div>
  );
}

/** One setting: label and help on the left, the control on the right. */
export function SettingRow({
  label,
  help,
  htmlFor,
  labelId,
  children,
  wideControl = false,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  /** The control's id, so the label is a real <label>. */
  htmlFor?: string;
  /** For a control labelled by id (a radiogroup, a switch). */
  labelId?: string;
  children?: React.ReactNode;
  /** A control that needs room (a set of options): it takes the row's
   * right half instead of its natural width. */
  wideControl?: boolean;
}) {
  const labelClass = "text-sm font-medium text-text-primary";
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:flex-1">
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <p id={labelId} className={labelClass}>
            {label}
          </p>
        )}
        {help && <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{help}</p>}
      </div>
      {children !== undefined && (
        <div className={`min-w-0 ${wideControl ? "sm:w-1/2 sm:shrink-0" : "sm:shrink-0"} flex sm:justify-end`}>{children}</div>
      )}
    </div>
  );
}

/** A read-only value in a row: a version, a count, a name. */
export function SettingValue({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={`text-sm text-text-primary ${mono ? "font-mono" : ""}`}>{children}</span>;
}

export const SETTINGS_PRIMARY_BUTTON =
  "rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60";

export const SETTINGS_SECONDARY_BUTTON =
  "rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

/** A form's one Save, at its foot: what happened on the left, the button
 * on the right. Inside a `SettingsGroup` it reads as the card's last row. */
export function SaveBar({
  label,
  pendingLabel,
  pending = false,
  disabled = false,
  status,
  onClick,
  onPress,
  intent,
  secondary,
}: {
  label: React.ReactNode;
  pendingLabel?: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
  status?: React.ReactNode;
  /** Without one, the button submits its form. */
  onClick?: () => void;
  /** Called as the submit button is pressed (or Enter is), before the form submits. */
  onPress?: () => void;
  /** Sent as the form's `intent` field ("save"), beside a Test button's "test". */
  intent?: string;
  /** Other actions beside Save (Test, Cancel, Remove). */
  secondary?: React.ReactNode;
}) {
  // Save comes first in the markup, so Enter in a field presses it, and
  // last on screen.
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 bg-bg-0/30 px-5 py-3.5">
      {status && <div className="mr-auto min-w-0 text-sm">{status}</div>}
      <button
        type={onClick ? "button" : "submit"}
        name={intent ? "intent" : undefined}
        value={intent}
        onClick={onClick ?? onPress}
        disabled={pending || disabled}
        className={`order-last ${SETTINGS_PRIMARY_BUTTON}`}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </button>
      {secondary}
    </div>
  );
}

/** A text box in a settings row. */
export const SETTINGS_INPUT =
  "w-full rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";

/** "Connected" and the like, on the right of a card's heading. */
export function StatusPill({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "muted" | "warn" }) {
  const styles = {
    ok: "border-owned/30 bg-owned-bg text-owned",
    muted: "border-border-strong text-text-secondary",
    warn: "border-amber-400/40 text-amber-300",
  }[tone];
  return <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${styles}`}>{children}</span>;
}

/** A card's heading row inside a `SettingsGroup`: its name and what it's
 * for, with a status on the right. */
export function SettingsGroupHeader({
  title,
  description,
  status,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{description}</p>}
      </div>
      {status}
    </div>
  );
}

/** A server or service as a tile (Seerr's service cards): name and address,
 * whether it's ready, its badges, and its actions along the bottom. */
export function ServiceTile({
  title,
  address,
  status,
  badges,
  actions,
  highlighted = false,
  children,
}: {
  title: React.ReactNode;
  address?: React.ReactNode;
  status: { ok: boolean; label: React.ReactNode };
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  highlighted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex min-w-0 flex-col rounded-2xl border bg-bg-1 p-4 transition-colors ${
        highlighted ? "border-accent" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{title}</p>
          {address && <p className="mt-0.5 truncate text-xs text-text-muted">{address}</p>}
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-xs ${status.ok ? "text-owned" : "text-amber-300"}`}>
          <span aria-hidden className={`h-2 w-2 rounded-full ${status.ok ? "bg-owned" : "bg-amber-300"}`} />
          {status.label}
        </span>
      </div>
      {children}
      <div className="mt-3 flex min-h-[22px] flex-wrap gap-1.5">{badges}</div>
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">{actions}</div>}
    </li>
  );
}

/** The dashed "Add …" tile at the end of a row of service tiles. */
export function AddTile({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={active || disabled}
        className={`flex h-full min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm transition-colors disabled:cursor-default ${
          active ? "border-accent text-text-primary" : "border-border-strong text-text-secondary hover:border-accent hover:text-accent"
        }`}
      >
        <span aria-hidden className="text-2xl leading-none">
          +
        </span>
        {label}
      </button>
    </li>
  );
}

export const TILE_BUTTON =
  "rounded-full border border-border-strong px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
