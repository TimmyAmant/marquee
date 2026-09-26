import { getTraktClientId } from "@/lib/integrations/app-settings";
import { getDiscoverLayout } from "@/lib/discover/layout";
import { MAX_CUSTOM_SHELVES, type LayoutShelf } from "@/lib/discover/shelves";
import type { DiscoverSettings, DiscoverShelfSetting } from "@/lib/api/types";

export const DISCOVER_SETTINGS_FORBIDDEN = "Only the admin can arrange Discover.";

export function discoverShelfSettingDto(shelf: LayoutShelf): DiscoverShelfSetting {
  return {
    id: shelf.id,
    kind: shelf.kind,
    title: shelf.title,
    custom: shelf.custom,
    hidden: shelf.hidden,
    source: shelf.source ? { ...shelf.source } : null,
  };
}

export async function discoverSettingsDto(shelves?: LayoutShelf[]): Promise<DiscoverSettings> {
  const [layout, traktClientId] = await Promise.all([
    shelves ? Promise.resolve(shelves) : getDiscoverLayout(),
    getTraktClientId().catch(() => null),
  ]);
  return {
    shelves: layout.map(discoverShelfSettingDto),
    traktConfigured: Boolean(traktClientId),
    maxCustomShelves: MAX_CUSTOM_SHELVES,
  };
}
