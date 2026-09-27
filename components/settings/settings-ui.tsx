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
  secondary,
}: {
  label: React.ReactNode;
  pendingLabel?: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
  status?: React.ReactNode;
  /** Without one, the button submits its form. */
  onClick?: () => void;
  /** Another action beside Save (Cancel, Remove). */
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 bg-bg-0/30 px-5 py-3.5">
      {status && <div className="mr-auto min-w-0 text-sm">{status}</div>}
      {secondary}
      <button
        type={onClick ? "button" : "submit"}
        onClick={onClick}
        disabled={pending || disabled}
        className={SETTINGS_PRIMARY_BUTTON}
      >
        {pending && pendingLabel ? pendingLabel : label}
      </button>
    </div>
  );
}
