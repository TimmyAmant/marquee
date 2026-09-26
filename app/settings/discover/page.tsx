import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getDiscoverLayout } from "@/lib/discover/layout";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { MAX_CUSTOM_SHELVES } from "@/lib/discover/shelves";
import { DiscoverSettingsEditor } from "./discover-settings";

export default async function DiscoverSettingsPage() {
  const viewer = await getViewerContext();
  if (!viewer.session || !viewer.isAdmin) redirect("/settings");
  const [shelves, traktClientId] = await Promise.all([getDiscoverLayout(), getTraktClientId().catch(() => null)]);

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Discover rows</h2>
      <p className="mt-2 text-sm text-text-secondary">
        The rows on Discover, for everyone in the household. Move them, hide the ones nobody uses, and add your own —
        a TMDb keyword, genre, studio, network or list, a Trakt list, or what&apos;s new in your library.
      </p>
      <DiscoverSettingsEditor
        initial={shelves}
        traktConfigured={Boolean(traktClientId)}
        maxCustomShelves={MAX_CUSTOM_SHELVES}
      />
    </div>
  );
}
