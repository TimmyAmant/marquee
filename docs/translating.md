# Translating Marquee

Marquee is written in English and translated into **Spanish (`es`), French
(`fr`), German (`de`) and Portuguese, Brazil (`pt-BR`)** on the website, the
Mac app and the Windows app. English is the source and the fallback: a
message that isn't translated yet shows in English, never as a blank.

Before translating anything, read the [glossary](i18n-glossary.md). It fixes
the words for Marquee's own ideas (request, approve, decline, library,
monitored, household, …), how each language addresses the reader, and the
names that are never translated (Plex, Sonarr, TMDb, …). The three apps
use the same words, so someone who switches from the website to the Mac app
reads the same thing.

## How a language is chosen

1. The account's own choice: Settings › Account › Appearance › Language
   (stored as `users.language`, also settable with `PATCH /api/v1/me`).
   It follows the person to every device, and their notifications
   (bell, push, email, Telegram, …) are written in it.
2. Otherwise the browser's `Accept-Language` (the website) or the system
   language (the apps, which send it to the server as `Accept-Language`).
3. Otherwise English.

URLs never contain a language. Household channels (Discord, ntfy, the
household webhook) are written in the admin's language. Titles, overviews
and names come from TMDb as they are.

## Where the text lives

| Platform | Files | Format |
|---|---|---|
| Website and server | `lib/i18n/messages/<language>/<namespace>.json` | Flat JSON, ICU MessageFormat subset |
| Mac | `mac/Marquee/Resources/Localizable.xcstrings` | Xcode String Catalog |
| Windows | `windows/Marquee.Windows/Strings/<language>/*.resw` | .resw (XML) |

### Website and server

Each namespace (`common`, `nav`, `discover`, `title`, `requests`,
`settings`, `integrations`, `admin`, `help`, `auth`, `server`, `notify`) is
one JSON file per language with the same keys as English:

```json
{
  "requestedBy": "Requested by {name}",
  "seasonCount": "{count, plural, one {# season} other {# seasons}}"
}
```

- `{name}` is filled in by the code; keep every placeholder, spelled
  exactly the same. You may move it anywhere in the sentence.
- `{count, plural, one {…} other {…}}` picks a form by the language's plural
  rules (`#` is the number). Add the forms your language needs (French
  treats 0 and 1 as `one`); `=0 {…}` matches an exact number.
- `{kind, select, movie {…} tv {…} other {…}}` picks by a value.
- `<link>…</link>`, `<b>…</b>` mark parts of a sentence that become a link
  or bold text. Keep the tags; put them around the words your language
  links or stresses.

In code, Server Components and server code use `const t = await getT()`
(`lib/i18n/server.ts`); Client Components `const t = useT()`
(`lib/i18n/client.tsx`); then `t("namespace.key", { name })`. Dates,
times and numbers go through `lib/i18n/format.ts` (Intl), never hand-built.

## Checks that run in CI

- **Website:** `lib/i18n/messages.test.ts` fails if any language is missing
  an English key, has a key English doesn't, has a blank message, or
  changes a message's placeholders or tags. `lib/i18n/hardcoded-strings.test.ts`
  fails on text written straight into the JSX of `app/` and `components/`
  (and in `placeholder`, `title`, `alt`, `aria-label` attributes) instead of
  going through `t()`. Brand names are allowed; a genuine exception can be
  marked with an `i18n-ignore` comment.
- **Mac:** tests check that every String Catalog entry is translated into
  every language with the same format specifiers, that the catalog has
  every string the code uses, and that UI code doesn't bypass localization.
- **Windows:** Core tests check that every English `.resw` key exists in
  every language with the same `{0}` placeholders, and that XAML and view
  models don't carry literal text.

## Adding a language

Say, Italian (`it`):

1. **Website/server.** Add `"it"` to `LOCALES` in `lib/i18n/locales.ts`,
   with its name in its own words in `LOCALE_NAMES` (`"Italiano"`) and its
   TMDb tag in `tmdbLanguage`. Add `"it"` to `LOCALES` in
   `scripts/i18n-index.py` and run `python3 scripts/i18n-index.py` — it
   creates empty `lib/i18n/messages/it/*.json` files and regenerates the
   index. Copy each English file's keys and translate the values. `npm test`
   tells you what's missing. No database migration is needed: languages are
   checked in code.
2. **Mac.** Add `it` to `CFBundleLocalizations` in `mac/project.yml` and the
   app's language list, then fill the Italian column of
   `Localizable.xcstrings` (in Xcode, or with any String Catalog-aware
   tool).
3. **Windows.** Add `windows/Marquee.Windows/Strings/it/Resources.resw`
   (folders are named by the neutral language, `es`, `fr`, `de`, except
   `en-US` and `pt-BR`) with a copy of every English `<data>` entry, and
   translate the `<value>`s. Add `"it"` to `AppLanguage.Supported` (with its
   name in `AppLanguage.NativeName` and its prefix in `AppLanguage.Normalize`,
   `windows/Marquee.Core/Localization/AppLanguage.cs`), its folder to
   `Resw.Translations` in `windows/Marquee.Core.Tests/Support/Strings.cs`,
   and, if its plural rule differs from English's, to `Loc.IsSingular`.
4. Add a column to [the glossary](i18n-glossary.md) and translate its terms
   first.
5. Update the API docs' list of languages (`docs/api-v1.md`, `GET /me`).

## Translation platforms

The formats above are the ones hosted platforms understand directly, so
Weblate or Crowdin could be wired up later without changing any code:
the website's files are "JSON with ICU MessageFormat" (one component per
namespace, `lib/i18n/messages/*/<namespace>.json`, English as the template),
the Mac app's is an "Xcode String Catalog", and the Windows app's are
"RESX/RESW". Contributors would then translate in a browser and the
platform opens pull requests with the updated files — the CI checks above
are what keep those pull requests honest.
