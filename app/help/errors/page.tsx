import type { Metadata } from "next";
import { errorReference } from "@/lib/help/error-reference";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("help.errorsMetaTitle") };
}

export default async function ErrorReferencePage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">{t("help.errorsTitle")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{t("help.errorsIntro")}</p>

      <div className="mt-10 flex flex-col gap-10">
        {errorReference(t).map((category) => (
          <div key={category.title}>
            <h2 className="font-display text-xl text-text-primary">{category.title}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {category.entries.map((entry) => (
                <div
                  key={entry.message}
                  className="rounded-2xl border border-border bg-bg-1 p-4"
                >
                  <p className="font-mono text-sm text-red-400">{t("help.errorsQuoted", { message: entry.message })}</p>
                  <p className="mt-2 text-sm text-text-primary">{entry.meaning}</p>
                  <p className="mt-1.5 text-sm text-text-secondary">
                    <span className="text-text-muted">{t("help.errorsWhatToDo")} </span>
                    {entry.whatToDo}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
