#!/bin/sh
# Adds every string the compiler extracted from the apps (the .stringsdata
# files of the last Mac build in build/DerivedData and, when there is one,
# the last iPhone build in build/DerivedDataiOS) to
# Marquee/Resources/Localizable.xcstrings, and marks strings the code no
# longer uses as stale. New keys then need es, fr, de and pt-BR translations
# (docs/i18n-glossary.md); LocalizationTests fails until they have them.
#
#   cd mac && xcodebuild … -derivedDataPath build/DerivedData build && Scripts/sync-strings.sh
set -eu
cd "$(dirname "$0")/.."
if [ -z "$(find build/DerivedData/Build/Intermediates.noindex/Marquee.build -path '*/Marquee.build/Objects-normal/*' -name '*.stringsdata' 2>/dev/null | head -1)" ]; then
  echo "No .stringsdata in build/DerivedData — build the app first." >&2
  exit 1
fi
# The iPhone target's folder has a space in it ("Marquee iOS.build"), so the
# list goes through find -print0. Without an iPhone build its strings would
# be marked stale, so build both before syncing:
#   xcodebuild -scheme "Marquee iOS" -sdk iphonesimulator -derivedDataPath build/DerivedDataiOS build
# Give strings only the iPhone app uses the comment "Marquee for iPhone only."
# (LocalizationTests tells the two apps' strings apart by it).
{
  find build/DerivedData/Build/Intermediates.noindex/Marquee.build -path '*/Marquee.build/Objects-normal/*' -name '*.stringsdata' -print0
  find build/DerivedDataiOS/Build/Intermediates.noindex/Marquee.build -path '*/Marquee iOS.build/Objects-normal/*' -name '*.stringsdata' -print0 2>/dev/null
} | xargs -0 xcrun xcstringstool sync Marquee/Resources/Localizable.xcstrings --stringsdata
