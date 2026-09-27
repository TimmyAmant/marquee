import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getDiscoverLayout } from "@/lib/discover/layout";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { MAX_CUSTOM_SHELVES } from "@/lib/discover/shelves";
import { DiscoverSettingsEditor } from "./discover-settings";
import { getT } from "@/lib/i18n/server";

export default async function DiscoverSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const [shelves, traktClientId] = await Promise.all([getDiscoverLayout(), getTraktClientId().catch(() => null)]);
  const t = await getT();

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">{t("integrations.discoverTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("integrations.discoverIntro")}</p>
      <DiscoverSettingsEditor
        initial={shelves}
        traktConfigured={Boolean(traktClientId)}
        maxCustomShelves={MAX_CUSTOM_SHELVES}
      />
    </div>
  );
}
