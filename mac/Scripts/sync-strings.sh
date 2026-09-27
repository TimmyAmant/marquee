#!/bin/sh
# Adds every string the compiler extracted from the app (the .stringsdata
# files of the last build in build/DerivedData) to
# Marquee/Resources/Localizable.xcstrings, and marks strings the code no
# longer uses as stale. New keys then need es, fr, de and pt-BR translations
# (docs/i18n-glossary.md); LocalizationTests fails until they have them.
#
#   cd mac && xcodebuild … -derivedDataPath build/DerivedData build && Scripts/sync-strings.sh
set -eu
cd "$(dirname "$0")/.."
objects=$(find build/DerivedData/Build/Intermediates.noindex/Marquee.build -path '*/Marquee.build/Objects-normal/*' -name '*.stringsdata' 2>/dev/null)
if [ -z "$objects" ]; then
  echo "No .stringsdata in build/DerivedData — build the app first." >&2
  exit 1
fi
# shellcheck disable=SC2086
xcrun xcstringstool sync Marquee/Resources/Localizable.xcstrings --stringsdata $objects
