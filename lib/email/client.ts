import nodemailer from "nodemailer";

// Email over the admin's own SMTP server (Gmail with an app password,
// Fastmail, a relay on the LAN…), to one or more addresses.

export type EmailConfig = {
  host: string;
  port: number;
  /** TLS from the first byte (usually port 465). Otherwise STARTTLS is used
   * when the server offers it (587, 25). */
  secure: boolean;
  username: string | null;
  password: string | null;
  from: string;
  to: string[];
};

const TIMEOUT_MS = 10_000;
// Loose on purpose — the SMTP server is the real judge — but enough to catch
// a name typed into the wrong box.
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Splits "a@x.com, b@y.com" into addresses. Pure. */
export function parseRecipients(value: string): string[] {
  return [...new Set(value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Pure; unit tested. */
export function emailConfigError(config: EmailConfig): string | null {
  if (!config.host || /[\s/]/.test(config.host)) return "Enter the SMTP server's host name, like smtp.gmail.com.";
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) return "Enter the SMTP port, like 587.";
  if (Boolean(config.username) !== Boolean(config.password)) {
    return "Enter both the SMTP username and password, or neither.";
  }
  if (!ADDRESS.test(config.from)) return "Enter the address the emails come from.";
  if (config.to.length === 0) return "Enter at least one address to send to.";
  if (config.to.length > 20) return "Send to at most 20 addresses.";
  const bad = config.to.find((a) => !ADDRESS.test(a));
  if (bad) return `"${bad}" isn't an email address.`;
  return null;
}

function transport(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

async function send(config: EmailConfig, subject: string, text: string): Promise<void> {
  await transport(config).sendMail({
    from: { name: "Marquee", address: config.from },
    to: config.to,
    subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200),
    text,
  });
}

export async function sendEmail(config: EmailConfig, subject: string, text: string): Promise<boolean> {
  return send(config, subject, text)
    .then(() => true)
    .catch(() => false);
}

/** Sends a test email; the error is the SMTP server's own answer, which
 * usually says what's wrong (a rejected password, a refused sender). */
export async function verifyEmail(config: EmailConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await send(config, "Marquee is connected", "Marquee will send its notifications to this address.");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.slice(0, 300) };
  }
}
