export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

/** Hand-maintained, newest first — bumped in package.json and appended to
 * here on every push to GitHub, so the version number in the footer always
 * has something concrete to link to. Entries from 0.1.0 through 0.6.0 were
 * backfilled from git history when versioning was introduced; every entry
 * from 0.7.0 onward is written at push time. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.76.3",
    date: "2026-10-07",
    changes: [
      "People pages now include what someone made behind the camera, not just their acting roles: Christopher Nolan's page lists Inception, Oppenheimer and the rest of his films (it used to show mostly interviews and documentaries), Steven Spielberg's goes from about 220 titles to over 400, and Tom Hanks' includes what he directed and produced. The Role column says what they did (\"Director, Writer\"), after the character when they also acted in it.",
      "People pages no longer show blank cards for titles TMDb has no artwork for.",
      "TV pages show the cast from every season, not just the latest: Grey's Anatomy's cast now includes Sandra Oh, Justin Chambers and Patrick Dempsey, and Game of Thrones' Sean Bean. Executive producers likewise come from the whole run.",
      "Shows that are still airing (and movies around their release) now pick up new seasons, episodes and release dates within a day, instead of up to two weeks later.",
      "\"Currently streaming on\" now includes free and ad-supported services like Tubi, Pluto TV and Freevee.",
      "Request from my Plex Watchlist now reads your whole watchlist, not just the newest 100 titles, so older titles on it get requested and show in Your Watchlist too.",
      "Search: a section no longer disappears when all its matches are less well known (people without a photo, studios without a logo); they're shown instead of nothing.",
      "Discover shows every genre, not just the first twelve (Mystery, Romance, Science Fiction, Thriller, War and Western were missing).",
      "Calendar: a show's episodes no longer go missing when its TheTVDB lookup fails; Sonarr's own TMDb id is used first.",
      "Library: a title Radarr or Sonarr has no longer disappears when TMDb couldn't be reached during the sync; it shows with its name until TMDb answers again.",
      "Favorites: something favorited while TMDb couldn't be reached now appears once TMDb answers, instead of never.",
      "Requests: Past requests lists the last 500 reviewed, up from 50.",
    ],
  },
  {
    version: "0.76.2",
    date: "2026-10-07",
    changes: [
      "Studio and network pages now list everything they've made, not just their newest hundred or so titles: Warner Bros. Pictures goes from 129 titles to almost 2,900 (back to 1918), Prime Video to over 1,400 series and HBO to over 340. Titles TMDb has no artwork for are left out.",
      "Studio pages pick up new releases within a day, instead of every two weeks.",
      "Long lists (a big studio's page, a large library) load faster on the website: the posters appear as you scroll down instead of all at once.",
    ],
  },
  {
    version: "0.76.1",
    date: "2026-10-07",
    changes: [
      "Smoother scrolling on the website: posters no longer keep a hidden loading animation running after their artwork appears, and the little badges on each poster are cheaper to draw.",
      "Mac and iPhone: smoother scrolling through posters. Artwork is now prepared in the background instead of the moment it scrolls into view, and the Mac only draws a poster's shadow while you hover it.",
      "A network's page opens faster the first time.",
    ],
  },
  {
    version: "0.76.0",
    date: "2026-10-07",
    changes: [
      "Networks like Prime Video, HBO and Netflix now get their own page, laid out like a studio's: the logo, how many series, artwork from its best-known show and a searchable list of its series. Network logos on Discover and network search results open it.",
      "Title pages: a \"Search for missing\" button (\"Search for movie\" on movies) tells Sonarr or Radarr to go look for everything that's missing and download it, like Search Monitored in Sonarr and Radarr. It replaces Search now in the \"…\" menu.",
      "Calendar: bigger and easier to read. It uses more of the window, shows larger posters and titles with the episode under each one, and several episodes of a show on the same day are one row (\"S01E03–E06\"). \"+N more\" now shows the rest of the day.",
      "Movies, Series and network pages no longer fill up with blank cards for titles TMDb has no artwork for.",
      "Windows: trailers now play inside the app, like on the website, Mac and iPhone, with Open on YouTube and Done (Escape closes it).",
      "Windows: marquee:// links (for example marquee://title/movie/603) now open in the app. They only ever open a page; they never do anything on your behalf.",
      "Mac, iPhone and Windows: typing a server's name without http:// or https:// now tries a secure https connection first when the server isn't on your home network, and falls back to http only if that doesn't work.",
      "Mac, iPhone and Windows: a server reached over plain http across the internet now shows \"Not encrypted\" on the sign-in screen and in Settings, so you know your password isn't protected on the way.",
      "Mac, iPhone and Windows: recent searches are now kept for each account and cleared when you sign out, as on the website, so someone else signing in on the same device never sees yours.",
      "Mac and iPhone: clicking a notification banner now marks that notification read, like clicking it in the bell. A banner for an account that isn't the one signed in no longer opens anything.",
      "Mac and iPhone: the apps no longer follow a server's redirects, so your sign-in is never sent anywhere other than the address you entered. A server that redirects now says it didn't answer like a Marquee server, as on Windows.",
      "Mac and iPhone: links the server hands the apps (Open in Radarr/Sonarr, Play on Plex, the Telegram bot, sign-in pages) only open web pages or the media server's own app, and trailers only play real YouTube videos.",
      "Mac: Sign Out now always removes this Mac's saved sign-in from disk, even if the file holding it can't be read.",
      "Mac: downloading an update is faster.",
    ],
  },
  {
    version: "0.75.1",
    date: "2026-10-05",
    changes: [
      "Fixed: a show or movie you moved into your library by hand could stay Downloading or incomplete until you pressed Refresh in Sonarr or Radarr. Marquee now notices when Plex or Jellyfin has it and asks Sonarr or Radarr to look again, and it keeps watching a finished download after an update or restart.",
    ],
  },
  {
    version: "0.75.0",
    date: "2026-10-04",
    changes: [
      "Notifications follow whoever is signed in: if someone signs in on a browser where the last person's session ran out (rather than signing out from Settings), that browser's notifications now go to the new account instead of still arriving for the previous one — admin Approve/Decline included.",
      "Recent searches are now kept for each account and cleared when you sign out, so someone else signing in on the same browser never sees yours.",
      "Approve and Decline on a new-request notification, and the message after you press one, are now in your own language.",
      "Search suggestions now say a title's library status in words, like \"Movie · Owned\", not only with a colour.",
      "The trailer player works from the keyboard: focus moves into it, Tab stays inside, Escape closes it and focus goes back to the Trailer button. Screen readers announce it as a dialog.",
      "Pages are lighter: the website no longer sends the whole app's translations with every page, only the text the page can show.",
      "The notifications bell and the Requests badge no longer check for news while the tab is in the background; they catch up as soon as you come back to it.",
      "Fixed: dates and times in comments, Settings › Jobs, the server logs and the Requests page's Can't find and Couldn't add lists could show in the server's time zone, or make the page redraw itself as it loaded. They now show in your own time zone.",
      "Fixed: a button could stay greyed out (\"Saving…\") for good when the server couldn't be reached. It now comes back and says something went wrong, and a Discover shelf you moved or hid goes back where it was.",
      "Fixed: pressing Cancel on \"Sign in with Plex\" and trying again could show the first try's \"expired\" error over the new one. Jellyfin's Quick Connect had the same problem.",
      "Fixed: clearing the search box quickly could bring the old suggestions back under the empty box, and Escape on the recent searches list closed the whole search panel instead of just the list.",
      "Fixed: the Library's search box could undo a filter picked while it was waiting, and every pause while typing added a step to the back button.",
      "Fixed: opening the notifications bell just as it checked for news could bring the badge straight back.",
      "Fixed: the server logs could show lines for a filter you'd already changed.",
      "Fixed: the small favourite star on posters now says why when it couldn't save.",
      "Fixed: connecting Plex in Settings › Media servers gave up if the connection dropped for a moment, and kept checking after you left the page.",
      "Streaming links on title pages only ever open secure (https) pages.",
    ],
  },
  {
    version: "0.74.0",
    date: "2026-10-04",
    changes: [
      "Settings › Jobs now says which time zone a \"Daily at\" time is in, for example \"Daily at 3:00 AM (UTC)\". In Docker that's UTC unless you set TZ to your own zone (e.g. TZ=America/New_York); the Unraid template and docker-compose.yml now have a TZ setting for it.",
      "Before an update changes the database, Marquee now saves a copy of it in the database folder (marquee-backups, the newest 3 kept), so a bad update can be undone. If the update fails, Marquee says where the copy is and shuts its database down cleanly.",
      "Pressing Run now on a job that's already running now says so, instead of starting a second copy alongside it.",
      "Fixed: a burst of wrong passwords could keep the real owner from signing in for over an hour. Now the wait never builds up past a few seconds.",
      "Fixed: guessing a notification channel's confirmation code many times at once could get more than the 5 tries allowed.",
      "Fixed: a request could be sent to Sonarr or Radarr with a folder that isn't one of its root folders. Approving now checks the folder against the server's own list.",
      "Fixed: the hourly Sonarr/Radarr sync could briefly put back an older status over a download the download watch had just seen start or finish.",
      "Fixed: when two \"Can't find\" checks ran at the same time, reviewers could get the same alert twice.",
      "The website now tells browsers to run only Marquee's own scripts, which blocks most kinds of script injection. Embedding Marquee in Organizr or Homarr still works.",
      "The hourly Sonarr/Radarr sync is faster on big libraries.",
      "Saving a TMDb key no longer hangs if TMDb doesn't answer.",
    ],
  },
  {
    version: "0.73.0",
    date: "2026-10-04",
    changes: [
      "Recent searches: tap an empty search box to see your last 8 searches and tap one to search it again, no retyping. Remove one with its ×, or Clear them all. On the website and the Mac, iPhone, iPad and Windows apps.",
      "Pick a title from the search suggestions on a phone and swipe back, and your search is still there with its suggestions open, instead of an empty box.",
      "The search box has an × to clear what you typed.",
      "The Requests page now shows new requests on its own within about 20 seconds, so you don't have to leave it and come back.",
      "Fixed: approving a movie or show could fail with \"Couldn't add\" when Radarr or Sonarr was slow, most often while approving several at once. Marquee now waits longer, tries Radarr's search too if its direct lookup comes up empty, and checks whether the add went through anyway before calling it a failure. When it really fails, the message now says why.",
    ],
  },
  {
    version: "0.72.1",
    date: "2026-10-04",
    changes: [
      "Fixed: searching for a title with a hyphen, like \"wall-e\", now finds WALL·E and other titles spelled with a dot. \"walle\" counts as an exact match too.",
    ],
  },
  {
    version: "0.72.0",
    date: "2026-10-04",
    changes: [
      "Add or request a movie that's part of a collection you don't fully have, and Marquee now asks if you'd like the rest too — \"Part of The Matrix Collection: 3 other movies aren't in your library yet.\" Add all (the admin) or Request all gets them in one go; Not now won't ask about that collection again for a while. On the website and the Mac, iPhone, iPad and Windows apps.",
      "Opening the notifications bell now marks them all as read, so the badge goes away straight away — what's new keeps its dot while the list is open. No more Mark all read. On the website and the Mac, iPhone, iPad and Windows apps.",
      "Fixed: on phones, the season picker and Remove from Radarr/Sonarr dialogs could sit behind the bottom tab bar, hiding their buttons.",
      "Fixed: Library › Duplicates could list a movie Radarr hadn't downloaded yet next to the copy Plex or Jellyfin has, and a show whose folder name has dots in it (like The.Office.US).",
      "Fixed: \"Ready to move\" for a show is now sent for each new episode you're waiting to move, not just once a month.",
      "The download watch no longer asks Sonarr about every partly-downloaded show every minute; those are kept up to date by the hourly sync.",
    ],
  },
  {
    version: "0.71.1",
    date: "2026-10-04",
    changes: [
      "Library › Duplicates no longer lists a show just because Sonarr and Plex (or Jellyfin) see its folder from different places, like /tv/Ahsoka (2023) and /data/Tv Shows/Ahsoka (2023)/Season 01. A show kept in two different folders is still listed.",
    ],
  },
  {
    version: "0.71.0",
    date: "2026-10-03",
    changes: [
      "Download watch: while anything is downloading, Marquee checks Sonarr and Radarr every minute instead of every hour. Title pages show how far along a download is, like \"Downloading · 63%\".",
      "New \"Ready to move\" status (teal) for a download that finished but Sonarr or Radarr didn't import, so it's waiting in your download folder. The admin gets one \"Finished downloading, ready to move\" notification for it (it can be turned off in Settings › Notifications).",
      "Once you move the file into the movie's or show's folder, Marquee asks Sonarr or Radarr to look again, and it turns Owned within a couple of minutes (a show once every episode is there). Whoever requested it is told it's ready to watch.",
      "Title pages now show Downloading while Sonarr or Radarr is downloading something, instead of Missing.",
      "Fixed: a finished download that wasn't imported could be flagged as \"Couldn't find it\".",
      "On the website and the Mac, iPhone, iPad and Windows apps.",
    ],
  },
  {
    version: "0.70.0",
    date: "2026-10-03",
    changes: [
      "Finished downloads that Radarr or Sonarr can't import (for example torrents saved straight into the download folder) no longer show as Downloading forever. They show as Owned once the file is in your library, or Missing if it isn't.",
      "A download still on its way in, including an upgrade of something you already have, still shows as Downloading.",
      "Email notifications: updated the email library to fix security issues.",
    ],
  },
  {
    version: "0.69.0",
    date: "2026-10-03",
    changes: [
      "Movies and shows that have finished downloading now show as Owned straight away, instead of Downloading for as long as the download client keeps seeding them. An upgrade to a better copy of something you already have still shows as Downloading while it's on its way.",
      "Finished miniseries whose episodes are all on disk now show as Owned instead of Downloading.",
    ],
  },
  {
    version: "0.68.0",
    date: "2026-09-28",
    changes: [
      "Requests: approved requests you can't get hold of now have a \"Can't get it\" button (on Past requests and the Can't find list), with the same reasons as Decline. Whoever asked is told it couldn't be added, and why.",
      "Remove from Radarr/Sonarr can say why, and whoever asked for it is told. Removed requests now show as Removed, with the reason, instead of Approved — so the title can be asked for again.",
      "On the website and the Mac, iPhone, iPad and Windows apps.",
    ],
  },
  {
    version: "0.67.0",
    date: "2026-09-28",
    changes: [
      "Title pages: Episodes and the cast now start right under the overview, beside the facts and file details card, instead of below it, so there's no big empty gap under the artwork. On the website and the Mac, iPad and Windows apps.",
      "Title, person and studio pages: the artwork behind the top of the page is brighter.",
      "Windows: the artwork now fades into the page properly instead of looking washed out and cut off.",
    ],
  },
  {
    version: "0.66.0",
    date: "2026-09-27",
    changes: [
      "iPhone and iPad: Settings is now built into the app with the same tabs as the Mac (Account, General, Members, Media servers, Services, Notifications, Discover, Blocklist, Jobs, Logs, Activity, About) instead of opening the website. Plex and single sign-on linking use the in-app sign-in sheet.",
      "iPad: notifications and sign-in messages say iPad instead of iPhone.",
    ],
  },
  {
    version: "0.65.0",
    date: "2026-09-27",
    changes: [
      "Mac, iPhone and Windows apps: if your server drops while you're using the app, a slim \"Reconnecting to your server…\" strip appears and clears itself when it's back; the can't-reach screen keeps retrying quietly every 30 seconds.",
      "iPad: a sidebar like the Mac's instead of the phone's bottom tabs.",
      "Mac and iPhone: Remove from Radarr/Sonarr has one Remove button and an \"Also delete the files\" switch, like the website and Windows.",
      "Phones: the … menu, color key, notifications and Play menus stay inside the screen.",
      "The server log file is kept in its own folder (a new Logs path in the Unraid template), so it survives container updates.",
      "Studio pages consider a studio's biggest titles, not just its newest, for their backdrop; Blocklist and Jobs settings describe the newer options.",
    ],
  },
  {
    version: "0.64.0",
    date: "2026-09-27",
    changes: [
      "Movie and show details now follow your language: titles, overviews, taglines, genres, posters, logos, trailers and season and episode names come from TMDb in Spanish, French, German or Portuguese when you use Marquee in that language, falling back to English wherever TMDb has no translation. On the website and every app.",
      "Search understands titles and genres typed in your language (\"terror\" finds Horror), and notifications use a title's name in each person's language once it's known.",
    ],
  },
  {
    version: "0.63.0",
    date: "2026-09-27",
    changes: [
      "Open in Radarr / Open in Sonarr on every movie and show page (one per server, 4K included), for the admin and anyone allowed to review requests. On phones it's in the … menu. On the website, Mac, Windows and iPhone.",
      "Settings › Services: each Sonarr/Radarr server has an optional Public URL used for these links, for when the server's own address only works inside your network.",
    ],
  },
  {
    version: "0.62.1",
    date: "2026-09-27",
    changes: [
      "Messages in the Mac, iPhone and Windows apps that pointed to \"Settings › Integrations\" now name the current tabs (General, Media servers).",
      "Behind the scenes: unused code, texts and an old database table removed across the website and apps.",
    ],
  },
  {
    version: "0.62.0",
    date: "2026-09-27",
    changes: [
      "Mac, iPhone and Windows apps: when your server is restarting or updating, the app shows \"Waiting for your server to come back…\" and reconnects on its own (for about 2 minutes) instead of saying nothing is answering on the port. It also retries when you switch back to the app, and never signs you out.",
      "Remove from Radarr 4K / Sonarr 4K in a title's … menu, with the option to delete the files, on the website and every app.",
      "Windows: Add to 4K has the Advanced arrow like the Mac; Settings › Discover has Region & language; Settings › Jobs has the \"Can't find\" hours setting; and Settings › About opens the Error reference.",
      "Override rule tiles on Mac and Windows show the genre names instead of a count.",
    ],
  },
  {
    version: "0.61.0",
    date: "2026-09-27",
    changes: [
      "Person pages have a full-width backdrop from the title they're best known for (How I Met Your Mother for Neil Patrick Harris), with a \"From …\" link to it, and their official links: IMDb, Instagram, X, Facebook, TikTok, YouTube and their website.",
      "Studio and network pages get a backdrop from their most popular title, plus a Website link when there is one. On the website, Mac, Windows and iPhone.",
    ],
  },
  {
    version: "0.60.1",
    date: "2026-09-27",
    changes: [
      "\"All features\" in Settings › About › Getting Support (and the website footer, the Mac Help menu and the iPhone More tab) opens a guide describing everything Marquee can do.",
    ],
  },
  {
    version: "0.60.0",
    date: "2026-09-27",
    changes: [
      "Show posters now show how many episodes you have on the right of the title, like 96/96 — grey when every aired episode is there, purple (like Downloading) while some are still missing (120/125). Specials and episodes that haven't aired yet aren't counted. On the website, Mac, Windows and iPhone; counts appear after the next library sync.",
    ],
  },
  {
    version: "0.59.5",
    date: "2026-09-27",
    changes: [
      "Opening a movie or show no longer flashes a grey wash with a dark \"Loading…\" band. The page shows a calm outline of the title page in its normal colours while it loads, then the artwork fades in — on the website, Mac, Windows and iPhone.",
    ],
  },
  {
    version: "0.59.4",
    date: "2026-09-27",
    changes: [
      "Website on phones: Library's section tabs are one line like Settings', and on Releases the View Changelog button stays on the right with the date under the version.",
      "Person pages no longer list a movie or show twice when TMDb renamed the character (\"Mr. Fantastic\" and \"Mister Fantastic\").",
    ],
  },
  {
    version: "0.59.3",
    date: "2026-09-27",
    changes: [
      "iPhone app: no more big gap at the top; page titles sit in the bar with the bell or the Back button.",
      "iPhone app: requests are full-width cards with Approve and Decline buttons; the calendar has Day, Week and Month views; the Library, Releases, person and studio pages are rebuilt to fit the phone; sheets fill the screen.",
    ],
  },
  {
    version: "0.59.2",
    date: "2026-09-27",
    changes: [
      "Website: on posters, the MOVIE / SERIES label and the status pill (Owned, Downloading, Coming soon…) now sit on the same line.",
    ],
  },
  {
    version: "0.59.1",
    date: "2026-09-27",
    changes: [
      "Mac and Windows: Settings is as wide as on the website, so all its tabs sit on one line. In a narrow window the Mac tightens them first and only wraps as a last resort.",
    ],
  },
  {
    version: "0.59.0",
    date: "2026-09-27",
    changes: [
      "On phones the website has a tab bar along the bottom, like the iPhone app: Discover, Search, Requests (with the number waiting for review), Calendar and More. More holds Movies, Series, Library, Favorites, Settings and Releases. Computers and tablets are unchanged.",
    ],
  },
  {
    version: "0.58.0",
    date: "2026-09-27",
    changes: [
      "Override rules (Settings › Services): send requests to a chosen Sonarr/Radarr server, quality profile, folder and tags based on genre, original language, keyword or who asked. The Advanced panel shows which rule picked them; choices made by hand still win.",
      "Gotify, Slack and Pushbullet notifications, both for the household (Settings › Notifications) and as your own channel.",
      "Job schedules (Settings › Jobs): change how often each job runs, or run it once a day at a set time, and see when it runs next.",
      "Logs (Settings › Logs): the server's log with level and text filters, auto-refresh, copy and download. Keys and tokens are masked.",
      "Blocklist by age rating (in your country) or TMDb's adult flag, with a preview of what it would block and which pending requests it affects.",
      "Remove from Radarr / Sonarr in a title's … menu, with the option to delete the files too. The title can then be requested again.",
    ],
  },
  {
    version: "0.57.1",
    date: "2026-09-27",
    changes: [
      "Mac and Windows: Settings' tabs wrap onto a second line in a narrower window, so Activity and About (where updates are) are always visible instead of hidden off the right edge.",
    ],
  },
  {
    version: "0.57.0",
    date: "2026-09-27",
    changes: [
      "A first iPhone (and iPad) app, built from the Mac app: sign in with your server, Plex, Jellyfin or single sign-on; Discover, Search, Requests (approve and decline), Calendar and More tabs; the new title pages with Request and the season picker. For now it's installed from Xcode — it isn't on the App Store or TestFlight yet, and alerts arrive while the app is open.",
      "Phones and tablets show up in your device list by model, like \"iPhone 17 Pro (Marquee)\".",
    ],
  },
  {
    version: "0.56.0",
    date: "2026-09-27",
    changes: [
      "Settings is redesigned, the same on the website, Mac and Windows: one row of tabs (Account, General, Members, Media servers, Services, Notifications, Discover, Blocklist, Jobs, Activity, About). Members only see the tabs that apply to them.",
      "Every setting sits on its own row, with its name and a short explanation on the left and the control on the right, and each form has one Save button that tells you when it worked.",
      "Plex, Jellyfin/Emby, Sonarr and Radarr show as tiles with their status and address, plus an \"Add\" tile. On the website \"Test\" now checks a connection without saving it.",
      "Notifications has a tab for each household channel (Discord, ntfy, Telegram, Pushover, Email, Webhook) next to your own settings.",
      "About shows whether a newer Marquee is out. Old Settings links still work.",
    ],
  },
  {
    version: "0.55.0",
    date: "2026-09-27",
    changes: [
      "Search results come in sections, in this order: Movies, TV Shows, People, then Studios & Networks, each with its count and \"See all\". Searching a person's name (\"tom hanks\") puts People first.",
      "Better ranking: popular exact matches come first, and adding a year (\"dune 1984\") picks that version. Obscure people and studios without a photo or logo are left out of the page (still in See all).",
      "People show as round photos with what they're known for; studios and networks as their logos. Networks can be searched too (\"hbo\", \"disney plus\").",
      "Suggestions while you type are grouped the same way under small labels, with studios and networks included, and the arrow keys move through all of them.",
      "The same search sections and suggestions in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.54.1",
    date: "2026-09-27",
    changes: [
      "\"Ready to watch\" now goes to the person who requested the title, once, when it's completely in: the movie's file, or every aired episode of the seasons they asked for. No more alert on the first episode of a show.",
      "The admin no longer gets a \"finished downloading\" alert for every file (unless they requested the title themselves). Discord, ntfy and the other household channels post once, when a requested title is complete.",
    ],
  },
  {
    version: "0.54.0",
    date: "2026-09-27",
    changes: [
      "Title pages use the whole screen: poster on the left, details in the middle, facts and File details on the right, with the rows below lined up to the same edges. Bigger posters and text on wide screens.",
      "The artwork now fills the top of the page and fades smoothly into it, with no hard edge, and stays readable even on bright pictures. Where TMDb has one, the title's own logo is shown instead of plain text (dark theme).",
      "The buttons sit on one tidy row, all the same height: Play and Add / Request first, \"Advanced\" as a small arrow joined to Add, and Search now, Stop monitoring, Block requests and Fix ID in a new \"…\" menu.",
      "Keywords wrap onto a second line instead of being cut off.",
      "The Mac and Windows apps' title pages get the same full-width layout, artwork and button row.",
    ],
  },
  {
    version: "0.53.0",
    date: "2026-09-27",
    changes: [
      "Title pages: Play on Plex / Jellyfin / Emby, IMDb, Rotten Tomatoes and Metacritic ratings (add a free OMDb key in Settings › Integrations), \"Currently streaming on\" for your region, and more facts (original title, cinema and digital dates, budget, revenue, studio).",
      "A new season picker for shows: a table with every season, its episode count and status, select-all, and a note when the request will be approved automatically. Afterwards the button reads \"Request more\".",
      "Discover: a Your Watchlist row, a region and language setting, and (admin) editing the rows right on the page with the pencil. A search bar across the top of the website on desktop.",
      "\"Show menu labels\" in Settings › Account shows names next to the menu icons, with the server version at the bottom.",
      "Member profiles: photo, requests made, requests left and their Plex Watchlist, from the household list or your own photo. Requests on the website are now wide cards over the title's artwork.",
    ],
  },
  {
    version: "0.52.2",
    date: "2026-09-27",
    changes: [
      "Library › Duplicates no longer lists the same file seen through different Docker folder mappings (Radarr's /movies/… and Plex's /data/Movies/… are one file), or a title just because both Plex and Jellyfin have it. Real duplicates — two different files, or two Plex or two Jellyfin servers listing it — still show.",
      "The Duplicates list's Server, Location, Size and Quality columns now line up from one title to the next.",
    ],
  },
  {
    version: "0.52.0",
    date: "2026-09-27",
    changes: [
      "The Library page is back, on the website and in the Mac and Windows apps: everything in Plex, Jellyfin/Emby, Sonarr and Radarr in one place, with filters (type, status, source, 4K/1080p/720p, HDR, codec, genre, year), sorting, search, and a grid or table view.",
      "Missing from collections: franchises you only partly own, with Add all or Request all missing. Duplicates (admin): the same title on several servers or with several files.",
      "Storage: free space per disk and a forecast of when it fills up at the current rate.",
    ],
  },
  {
    version: "0.51.1",
    date: "2026-09-27",
    changes: [
      "Quick add on posters now works in the Mac and Windows apps everywhere, including Discover: the admin gets \"+ Add to Radarr/Sonarr\", members get \"Request\" (following their permissions and the blocklist), and titles they already asked for show \"Requested\". No app update needed.",
    ],
  },
  {
    version: "0.51.0",
    date: "2026-09-27",
    changes: [
      "Coming from Seerr, Overseerr or Jellyseerr? Settings › Integrations › Import from Seerr brings over your users (matched to existing accounts, with their permissions and request limits), requests with their seasons and 4K, problem reports with comments, and the blocklist. You see a preview first; nothing is sent to Sonarr/Radarr and nobody is notified; running it again doesn't duplicate anything. Your Seerr API key is only used for the import and never saved.",
      "A step-by-step guide is in docs/migrating-from-seerr.md.",
    ],
  },
  {
    version: "0.50.0",
    date: "2026-09-26",
    changes: [
      "Marquee now speaks Spanish, French, German and Portuguese (Brazil), on the website and in the Mac and Windows apps. Pick your language in Settings › Account › Appearance; without a choice it follows your browser or computer, then English.",
      "Notifications (bell, push, email, Telegram, Pushover, your own webhooks) arrive in each person's language; household channels use the admin's.",
      "Movie and show titles and descriptions still come from TMDb in English for now.",
    ],
  },
  {
    version: "0.49.1",
    date: "2026-09-26",
    changes: [
      "Windows posters now look like the Mac's: a solid blue MOVIE or magenta SERIES label top-left, the status (Owned, Coming soon, Downloading…) top-right with the same colors, and the status strip along the bottom. Movies and Series pages also get the rating and a short overview on hover, like the Mac.",
    ],
  },
  {
    version: "0.49.0",
    date: "2026-09-26",
    changes: [
      "Your own Discover: in Settings › Discover you can reorder or hide the rows, and add your own — a keyword like anime, a genre, a studio like A24, a network like Netflix, a TMDb list, a public Trakt list, or recently added to Plex/Jellyfin. Each has a See all page. Nothing changes until you do.",
      "Trakt lists that stay in sync: anyone can add a Trakt watchlist or public list in Settings › Account, and new titles on it are requested for them every 3 hours, following their permissions, request limits and the blocklist. Reviewers get one alert per list.",
      "On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.48.1",
    date: "2026-09-26",
    changes: [
      "Status colors now match Radarr and Sonarr: green in your library, purple downloading or queued, red missing (monitored), orange not monitored, blue coming soon. Titles not in your library have no strip. Same on the website, Mac and Windows.",
      "New \"Not monitored\" state for titles that are in Sonarr/Radarr but not monitored and have no file (they used to look like they weren't in your library at all). Admins get Start monitoring for them.",
      "A \"Color key\" button on Discover, Movies, Series, search, and person and studio pages, and a \"What the colors mean\" help page (website footer and Settings › About, Mac Help menu, Windows Settings › About). Hover a poster's strip to see its status.",
    ],
  },
  {
    version: "0.48.0",
    date: "2026-09-26",
    changes: [
      "Permissions: when you edit a household member you now get switches for exactly what they can do — request movies, TV, 4K movies, 4K TV; auto-approve each of those; Advanced request options; see everyone's requests; review requests; handle problem reports; report problems; manage the blocklist; no request limits. Member and Trusted are presets that fill the switches in, and \"Custom\" shows when they match neither.",
      "Nothing changes on upgrade: everyone keeps exactly what they could do before. Settings, integrations, accounts, API keys and sign-in stay admin-only and can't be granted.",
      "Also fixed: the Can't find list's Search again and Mark as found on the website didn't check who was asking.",
      "On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.47.2",
    date: "2026-09-26",
    changes: [
      "Windows: sideways rows (Discover, Because you watched, cast, More like this…) no longer steal the mouse wheel — the wheel and touchpad always scroll the page. Move a row with its ‹ › buttons, or swipe it on a touch screen; tapping a poster still opens it. The draggable scrollbar is gone, and Left/Right keys move between posters in a row.",
    ],
  },
  {
    version: "0.47.1",
    date: "2026-09-26",
    changes: [
      "\"Because you watched\" on Movies and Series now shows up to 20 titles instead of 12, topped up from your other recent watches when one title has too few recommendations, so the row fills the screen. Titles you just watched are left out.",
    ],
  },
  {
    version: "0.47.0",
    date: "2026-09-26",
    changes: [
      "API keys: create named keys in Settings › Integrations › API access (read-only or full, optionally acting as one member, with an optional expiry) for dashboards, phone apps and scripts. A key is shown once, stored only as a fingerprint, and can be revoked any time. No key can change settings, integrations or sign-in.",
      "Marquee's API is now described at /api/v1/openapi.json, with a readable list at /api-docs.",
      "A summary for dashboard widgets (pending requests, problem reports, can't find, movies, series, downloading), with copy-paste setup for Homepage and Homarr in docs/integrations.md.",
    ],
  },
  {
    version: "0.46.1",
    date: "2026-09-26",
    changes: [
      "What's new: after an update, Marquee shows what changed once, with an OK button. When the server updates it shows on the website, phones and the Mac and Windows apps; when only the Mac or Windows app updates, it shows only in that app. New devices aren't shown a backlog.",
    ],
  },
  {
    version: "0.46.0",
    date: "2026-09-26",
    changes: [
      "Members can cancel or edit their own pending requests (seasons, whole series, 4K). Cancelling frees up their request limit.",
      "Reviewers can edit a request before approving it; the change is noted in the request's comments so the member knows.",
      "Comments on requests and problem reports, between the person who asked and the reviewers. Everyone in the conversation is notified (bell, devices and their own channels — never the household channels).",
      "Couldn't add: if Sonarr/Radarr can't be reached when a request is approved, it goes into a \"Couldn't add\" section with Retry, Decline and \"Added it by hand\" instead of failing quietly. The member sees \"Approved — waiting to be added\" and is only told it's approved once it's really added.",
      "On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.45.3",
    date: "2026-09-26",
    changes: [
      "One set of status colors everywhere — the poster corner label, the strip under posters, search, the title page and request rows, on the website, Mac and Windows: green in your library, blue downloading, orange missing (still looking), purple coming soon. Titles not in your library get no strip (it used to be yellow).",
      "A \"?\" color key on Movies, Series, search results and person/studio grids explains what each color means.",
      "Windows now shows all five colors and the strip under posters, and small colored text is easier to read in light mode. \"Can't find\" uses the orange.",
    ],
  },
  {
    version: "0.45.2",
    date: "2026-09-26",
    changes: [
      "Can't find: when an approved request is released but Sonarr/Radarr still hasn't found a download a day later, you (and trusted members) get \"Couldn't find Ice Age (2002) — requested by Susan\" in the bell, on your devices and on your channels. The wait is set in Settings › Jobs.",
      "The Requests page has a \"Can't find\" section with Search again, Open in Sonarr/Radarr and Mark as found, and the Requests badge counts them. It clears itself as soon as a download starts. One reminder after 7 days, no more.",
      "Members can turn on \"We're still looking for…\" in their notification choices. On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.45.1",
    date: "2026-09-26",
    changes: [
      "Share: a Share button on movie and TV pages. Send a title to anyone in your household with a short note — they get \"Susan shared Ice Age with you\" in the bell and on their devices, and tapping it opens the title.",
      "Or share it outside Marquee: your phone's share sheet (Messages, Messenger, WhatsApp…), or Copy link, text and email where that isn't available. Pick the Marquee link, or a TMDb/IMDb link for people who can't sign in. The Mac and Windows apps use their own share menus.",
      "\"Someone shares a title with me\" is in everyone's notification choices.",
    ],
  },
  {
    version: "0.45.0",
    date: "2026-09-26",
    changes: [
      "Personal notifications: everyone can add their own Telegram, Pushover, email, Discord, ntfy or webhook in Settings › Account › Notifications, with Send a test. Email (and a typed-in Telegram chat ID) is confirmed with a code first.",
      "Choose what you hear about, and where: a grid of events (approved, declined, ready to watch, started downloading, problem fixed — plus new requests and watchlist requests for reviewers) against the bell, your devices and each of your channels.",
      "Your Discord, ntfy, Telegram, Pushover, email and webhook setups are now \"Household channels\", with their own event choices. Nothing changes after the upgrade: nobody gets messages they didn't get before.",
      "On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.44.4",
    date: "2026-09-26",
    changes: [
      "Household members get \"Request all N missing\" on a collection (and TV crossover rows), next to where the admin has \"Add all\". It requests every title not already in the library, requested or blocked, through the normal request rules — limits, blocklist and auto-approve all apply — and says how many went through and why any didn't. Reviewers get one alert for the batch. On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.44.3",
    date: "2026-09-26",
    changes: [
      "Search suggestions: the Movie/TV label is colored by where the title stands — green in your library, blue downloading, red missing, purple coming soon, grey not in your library — on the website (including the phone menu search) and in the Mac and Windows apps. Windows search suggestions now show a poster and the year too.",
    ],
  },
  {
    version: "0.44.2",
    date: "2026-09-26",
    changes: [
      "Phones: a back button in the top bar on titles, people, studios and full lists, so you can walk back through title → actor → title, even in the Home Screen app, which has no browser back button. If there's no earlier Marquee page, it goes to Discover.",
    ],
  },
  {
    version: "0.44.1",
    date: "2026-09-26",
    changes: [
      "On a phone, with the menu set to Right (Settings › Account › Appearance), the menu now slides in from the right, next to the menu button. Left, Top and Bottom keep it on the left.",
    ],
  },
  {
    version: "0.44.0",
    date: "2026-09-26",
    changes: [
      "Single sign-on: sign in with Authentik, Authelia, Pocket ID, Keycloak, Google or any other OpenID Connect provider, on the website and in the Mac and Windows apps (the apps open your browser). Set it up in Settings › Integrations › Single sign-on; the card shows the address to paste into your provider.",
      "New accounts from single sign-on and matching existing accounts by verified email are both off until you turn them on. You can require a group to get in at all, and put people in a trusted group to make them Trusted — nobody is ever made admin this way.",
      "Anyone can link or unlink their single sign-on login in Settings › Account › Linked accounts.",
      "Jellyfin Quick Connect: \"Use Quick Connect\" on the Jellyfin sign-in shows a code you approve in any Jellyfin app you're signed in to.",
    ],
  },
  {
    version: "0.43.1",
    date: "2026-09-26",
    changes: [
      "The iPhone home-screen icon (and the browser tab icon) now use the same serif M as the apps, with the dot clear of the letter instead of touching it. Remove and re-add Marquee to your Home Screen to pick it up.",
    ],
  },
  {
    version: "0.43.0",
    date: "2026-09-26",
    changes: [
      "Any number of Sonarr and Radarr servers (Settings › Integrations), each with its own quality profile, folder, tags and webhook link, and a 4K switch. One of each kind is the default. Your current Sonarr, Radarr and 4K connections become the defaults automatically, and the old webhook links keep working.",
      "Anime: Sonarr servers have their own anime quality profile, folder and tags, and anime shows are added as series type Anime.",
      "Advanced options when approving a request or adding a title: pick the server, quality profile, folder, tags (and for shows, the series type). Past requests show where each title went.",
      "A title on any of your regular servers counts as in your library, and Search now, monitoring, the calendar and disk space look at every server. On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.42.4",
    date: "2026-09-26",
    changes: [
      "See all on every Discover shelf, on the website and in the Mac and Windows apps: Trending, Upcoming Movies, Upcoming Series and Recently Added open their full list (it keeps loading as you scroll); Popular, Genres, Studios and Networks open the Movies or Series grid.",
      "Windows: ‹ › buttons on every sideways row (Discover, Because you watched, cast, More like this…) to page back and forth, like the Mac.",
      "Shelf headers now match everywhere: the title, the See all button right after it, and the arrows at the right.",
    ],
  },
  {
    version: "0.42.3",
    date: "2026-09-26",
    changes: [
      "Mac: you stay signed in through relaunches and updates, and no more \"Marquee wants to use your confidential information\" Keychain password prompts. Your sign-in is kept in a private file only your Mac account can read. After this update, sign in once more.",
      "Mac: after signing out, the sign-in screen fills in your username. Your password is never saved.",
      "Old \"Marquee server session\" items in Keychain Access are no longer used and can be deleted.",
    ],
  },
  {
    version: "0.42.2",
    date: "2026-09-26",
    changes: [
      "Signing up with Plex, Jellyfin or Emby: when you've turned on new accounts from Plex/Jellyfin sign-in, the sign-in screen (website, Mac and Windows) now tells newcomers they can just sign in with it and their account is made for them.",
      "Someone without an account who tries Plex or Jellyfin sign-in is now told there's no Marquee account for them yet and to ask the admin to add them.",
    ],
  },
  {
    version: "0.42.1",
    date: "2026-09-26",
    changes: [
      "Mac: with the menu at the top or bottom, the bar now has its own space, so it no longer sits on posters and artwork (like Windows).",
    ],
  },
  {
    version: "0.42.0",
    date: "2026-09-26",
    changes: [
      "Menu position: put the menu bar on the left, right, top or bottom (Settings › Account). It's remembered per device, on the website and in the Mac and Windows apps. Phones keep the pull-out menu.",
      "Windows: Settings now has tabs like the Mac — Account, Integrations, Activity, Jobs and About (the admin-only ones are hidden from members) — with every integration, the webhook URLs, the activity feed and Run now for jobs.",
      "Windows: quick add on posters — hover a poster to add it to Sonarr/Radarr, request it, or see that it's requested, without opening it.",
      "Windows: Discover's Studios and Networks show logo tiles and the genres show artwork tiles, like the Mac; studios show their logo on title, search and favorites pages.",
      "Windows: the mouse wheel over a sideways row (Trending, Popular, cast…) scrolls the page instead of getting stuck on the row. Shift+wheel scrolls the row.",
      "Windows: poster grids fill the width, so they line up with the \"Because you watched\" row above.",
      "Mac and Windows: after \"Add all\" on a collection, the page updates right away — the posters show their new badges without leaving and coming back.",
    ],
  },
  {
    version: "0.41.0",
    date: "2026-09-26",
    changes: [
      "Request blocklist: block a title from its page (\"Block requests\", with an optional reason), or a TMDb keyword or genre in Settings (e.g. \"anime\"). Nobody can request those — members see \"Requests are closed for this title\" with your reason — and you can still add them yourself. On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.40.0",
    date: "2026-09-26",
    changes: [
      "Emby: connect an Emby server in the Jellyfin card (now \"Jellyfin or Emby\") — it speaks the same language, so the library, sign-in, linked accounts and member import all work with it, and everything says \"Emby\" once it's connected.",
      "New-request alerts: the admin and trusted members are notified when someone makes a request that's waiting for review (and Discord and the other channels hear about it once).",
      "On a phone or desktop browser with Marquee's notifications on, that alert has Approve and Decline buttons right on it (Android, Chrome and Edge; iPhone shows the alert without buttons).",
      "Installing the website as an app on Android now uses proper icons, and a long-press on the icon offers Requests and Search.",
    ],
  },
  {
    version: "0.39.0",
    date: "2026-09-26",
    changes: [
      "Request limits: when you edit a household member you can now cap their requests, for example 5 movies every 7 days, separately for movies and TV. Past the limit they're told how long until they can ask again, and they see what they have left on their Requests page. Their Plex Watchlist waits too.",
      "Trusted members: a new role between member and admin. A trusted member can approve or decline other people's requests and handle problem reports, their own requests go straight through, and they have no limits. Settings stay yours.",
      "On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.38.0",
    date: "2026-09-26",
    changes: [
      "Report a problem: on a title you have (or that's downloading), anyone can report bad video, an audio problem, missing subtitles, a file that won't play or the wrong movie/episode — for a show, down to the season and episode — with a note.",
      "The admin is notified and sees open reports on the Requests page under \"Reported problems\": \"Search again\" has Sonarr/Radarr look for another copy, and \"Mark fixed\" (with an optional note) tells whoever reported it. Members see their own reports and can withdraw them.",
      "The Requests badge counts open reports too. On the website and in the Mac and Windows apps.",
    ],
  },
  {
    version: "0.37.0",
    date: "2026-09-26",
    changes: [
      "4K servers: connect a second Sonarr and/or Radarr for 4K copies in Settings › Integrations (\"4K Sonarr\" and \"4K Radarr\", both optional). Your main library stays as it is.",
      "Members can then press \"Request in 4K\" on a title, even one you already have in HD. Approving it adds the title to the 4K server, and they're told when it's ready. You can also \"Add to 4K Radarr/Sonarr\" yourself.",
      "Title pages show what the 4K server has (\"In 4K\", \"4K downloading\"…), and requests say \"In 4K\" in every list. On the website and in the Mac and Windows apps.",
      "The 4K servers get their own webhook URLs (Settings › Integrations › Notifications) so downloads there notify too.",
    ],
  },
  {
    version: "0.36.0",
    date: "2026-09-26",
    changes: [
      "Telegram, Pushover and email notifications: next to Discord and ntfy in Settings › Integrations › Notifications (website, Mac and Windows). Everything that reaches the admin — grabbed, downloaded, requests approved or declined — also goes to each one you set up.",
      "Telegram: your own bot (@BotFather) and a chat, group or channel. Pushover: an application token and your user or group key. Email: your own mail server (SMTP) to one or more addresses; with a login it always uses an encrypted connection.",
      "Each one sends a test message before it's saved, and says what the service answered if it didn't go through. Saved tokens and passwords are never shown again; leave them blank to keep them.",
    ],
  },
  {
    version: "0.35.0",
    date: "2026-09-25",
    changes: [
      "Household members now show when each person last used Marquee — \"Active 3 hours ago\", \"Active 6 days ago\", \"Never signed in\" — so you can see who's still using it. Admin only, on the website and in the Mac and Windows apps.",
      "It counts the website and the apps alike, and starts from when each person's app sign-in was last used.",
    ],
  },
  {
    version: "0.34.1",
    date: "2026-09-25",
    changes: [
      "A show that's still downloading now shows its File details too (folder, size on disk so far, quality profile) on the website and in the Mac and Windows apps. Before, the card only appeared once every episode was there.",
    ],
  },
  {
    version: "0.34.0",
    date: "2026-09-25",
    changes: [
      "Request from your Plex Watchlist: with Plex linked, turn it on in Settings › Account (website, Mac and Windows). New movies and shows you add to your Watchlist on Plex are requested for you every 10 minutes, the same as pressing Request: the usual checks, your auto-approve setting, and the admin's approval queue.",
      "Choose Movies and/or TV shows, press Check now, or turn it off. Titles you already have or already asked for are skipped, and each title is tried once, so something the admin declined isn't requested again.",
      "Turning it on asks Plex once, and Marquee keeps that Plex sign-in (encrypted) only to read your watchlist; it's deleted when you turn it off or unlink Plex. If Plex stops accepting it, it switches itself off and says why.",
      "Settings › Jobs lists the new Plex Watchlist Requests job, with Run now.",
      "Fixed: the Windows app crashed when its window was dragged narrower than one poster; it now has a minimum size.",
      "After Stop monitoring on a show or movie with nothing downloaded yet, the page offered both Add to Sonarr/Radarr and Start monitoring, which do the same thing. It now shows just Start monitoring (website, Mac and Windows).",
      "Windows: the Calendar is a month grid again, like the website and the Mac (it had become a plain list), and the Calendar and Requests pages sit centered instead of pushed to the left.",
    ],
  },
  {
    version: "0.33.0",
    date: "2026-09-25",
    changes: [
      "Sign in with Plex or Jellyfin: once the admin has connected Plex or Jellyfin, the sign-in page (and the Mac and Windows apps) offers \"Sign in with Plex\" and a Jellyfin username and password. Anyone who can use your server can get in with the account they already have.",
      "Import from Plex / Jellyfin in Settings (\"Import from your media server\"): pick the people who share your server and they each get a member account that signs in with Plex or Jellyfin. A new setting lets anyone with access get an account the first time they sign in; it's off by default, so only people you import (or who link their account) get in.",
      "Linked accounts in Settings › Account: link your own Plex or Jellyfin account to your Marquee account to sign in with it, and unlink it again.",
      "The Plex server owner signing in with Plex is recognised as the admin. Plex sign-ins are checked against plex.tv on every sign-in, and Marquee never stores a member's Plex token.",
      "Fixed: newer Jellyfin versions could reject Marquee's requests; it now sends its token the way they expect.",
      "Fixed: reconnecting Plex to a different account while a sync was running could keep the old account's servers.",
    ],
  },
  {
    version: "0.32.0",
    date: "2026-09-25",
    changes: [
      "Request single seasons: on a TV show, Request opens a season picker. Each season shows whether it's in the library, being fetched (monitored), or already requested, and the rest can be ticked; \"Select all\" picks every one left. Works on the website and in the Mac and Windows apps.",
      "Request more seasons of a show you already have part of: the button appears on shows that are in the library or on their way whenever there are seasons left to ask for.",
      "When the admin approves a season request, Sonarr is told to fetch just those seasons (and searches for them right away), whether the show is new to Sonarr or already there with other seasons. A whole-show request still adds every season.",
      "Requests, the admin's queue, the history and the notifications name the seasons (\"Severance (Season 2) was approved\").",
    ],
  },
  {
    version: "0.31.2",
    date: "2026-09-25",
    changes: [
      "Settings › About in the Mac and Windows apps now says whether your server is up to date. If a newer Marquee is out, it names the version and how to update the server (pull the new Docker image; on Unraid, the Docker tab's Check for Updates).",
      "Under the hood: the database migration history is back in step with the schema, so future database changes generate cleanly. Nothing in your database changes.",
    ],
  },
  {
    version: "0.31.1",
    date: "2026-09-25",
    changes: [
      "Fixed: the calendar put evening TV episodes on the next day (it used the UTC date). They're on the day they air where the server is.",
      "Fixed: a season pack arriving from Sonarr could send the same \"ready to watch\" or \"finished downloading\" notification several times, to the app and to Discord, ntfy and push. Each now goes out once.",
      "Fixed: a request the admin declined could flip back to approved if two pages were loading at the same moment.",
      "Fixed: disconnecting Plex, Jellyfin, Sonarr or Radarr while a sync was running could bring the library back, and titles stayed \"In library\" forever.",
      "Faster: Discover and the library no longer load every title's full TMDb record, and Settings › Integrations no longer waits for a whole library sync before it opens. Big libraries get longer to answer a full sync instead of timing out every hour.",
      "Security: logins can't be used to lock the admin out any more (failed attempts slow down instead of blocking the right password), don't reveal which usernames exist, and refuse oversized requests. Sonarr/Radarr webhooks can't be silenced by someone spamming bad attempts. The server now runs as an unprivileged user inside the container, and its database requires a password. If Marquee sits behind a reverse proxy, set TRUSTED_PROXY_HOPS (see the README) so rate limits see real addresses.",
      "Mac and Windows apps: an update caught in the few minutes before its downloads are attached is checked again in 15 minutes instead of the next day. On Windows, an update is offered on the sign-in screen too, and a check finishing mid-download no longer interrupts it.",
      "Mac: Settings opened from a page (\"Connect Radarr…\" on a title) has a Back button to that page; the page behind the search pop-up no longer takes keyboard focus; a notification from the previous account is cleared on sign-out.",
      "Windows: only one copy of the app runs at a time (a second launch brings the open one forward), the bell no longer shows the previous account's notifications, and a few rare crashes (copying a file path while another app holds the clipboard, two dialogs at once) are fixed.",
      "Website: the notification bell polls once instead of twice, Escape closes the search suggestions before the search box, and old Mac download links work again.",
    ],
  },
  {
    version: "0.31.0",
    date: "2026-09-25",
    changes: [
      "Search and notifications moved onto the rail, on the website and in the Mac and Windows apps. The bell sits right under your photo, with a dot when something's unread, and its list opens beside the rail.",
      "Search opens as a pop-up over the page: click Search on the rail (or press ⌘F on the Mac, Ctrl+F on Windows), type, and pick a suggestion or press Return for all results. Escape or a click outside closes it.",
      "The top bar no longer carries a search box or the bell. On a phone, the website keeps its bell at the top, and search is in the menu.",
    ],
  },
  {
    version: "0.30.4",
    date: "2026-09-25",
    changes: [
      "Fixed: signing in to the Mac app could fail with \"Couldn't reach your Marquee server\" even though the server was listed right there, if the server had restarted (a Docker update, say) while the sign-in screen was open. You had to scan for the server again first. Now the app checks the server again and retries by itself, and if the server really is gone it says what it found.",
    ],
  },
  {
    version: "0.30.3",
    date: "2026-09-25",
    changes: [
      "The Mac app's sign-in screen after an update no longer explains why you're signing in again; it's just the sign-in form.",
    ],
  },
  {
    version: "0.30.2",
    date: "2026-09-25",
    changes: [
      "Settings in the Mac and Windows apps sits in a centered column instead of against the left edge, and the Mac's Account cards use the column's full width like the other tabs.",
    ],
  },
  {
    version: "0.30.1",
    date: "2026-09-25",
    changes: [
      "App downloads carry their version in the name: Marquee-0.30.1.dmg for the Mac and Marquee-Setup-0.30.1.exe for Windows, so a Downloads folder with several of them shows which is newest. The download buttons on the website go straight to the latest one.",
      "The Mac disk image has a proper install window: Marquee and your Applications folder with an arrow between them, how to get past macOS's first-launch warning, and a Read Me covering installing, connecting to your server and updates. Its window title shows the version.",
      "If the Mac app can't replace itself and leaves the new version in Downloads, it's named for its version too (Marquee 0.30.1.app).",
      "Settings in the Mac app is now a page of the main window instead of a separate window, with Account, Integrations, Activity, Jobs and About as tabs across the top. Your photo on the rail, ⌘, and the \"Connect…\" links open it. (The Windows app already worked this way.)",
    ],
  },
  {
    version: "0.30.0",
    date: "2026-09-25",
    changes: [
      "Marquee for Windows updates itself: it checks for a new release when it opens and once a day, and when there is one, an update button appears at the foot of the rail. It takes you to Settings › About, where Update downloads the new installer, checks it against the release, then closes Marquee, updates it and reopens it. Settings › About also has Check for updates and What's new. Install 0.30.0 once from the download link; later versions arrive through the button.",
      "The Mac app shows the same update button on its rail when a new release is out, alongside Marquee › Check for Updates… and Settings › About.",
      "Removed: the ☰ button at the bottom of the rail and the full menu it opened, on the website and in the Mac and Windows apps. Every section is already one click away on the rail. On a phone, where there's no rail, the menu button at the top still opens the menu.",
      "Marquee for Windows shows its real version in Settings › About (it said 0.1.0).",
    ],
  },
  {
    version: "0.29.0",
    date: "2026-09-25",
    changes: [
      "A new navigation menu, after the Plex app on Apple TV: a small frosted bar floats at the left edge with your photo and an icon for every section, and one click goes straight there. Rest on an icon to see its name; the ☰ button opens the full labeled menu. On a phone, the menu button at the top opens it. Pages get the room the old sidebar took up, and a title's backdrop now runs to the edge of the window. The Mac and Windows apps have the same menu.",
      "Profile photos: add one from Settings › Account › Edit. It's kept on your Marquee server, never uploaded anywhere else, and shows in the menu and next to each household member. Photos are cropped to a square, turned the right way up, and stripped of their location and camera details.",
      "API: /me, the login response and household members include avatarUrl, and GET/PUT/DELETE /users/{id}/avatar read, replace and remove a photo.",
      "Notifications on your devices, sent by your own Marquee server: after you sign in, Marquee asks whether this device should get them (a request approved or declined, a title ready to watch). On the website they're Web Push, encrypted so only your device can read them, with no account at any push service; they need Marquee opened over https, and on iPhone the site added to the Home Screen. Settings › Account › Notifications turns them on or off, lists your devices and sends a test.",
      "API: GET /notifications/stream, a live stream of new notifications for the Mac and Windows apps to show as system notifications without any outside push service.",
      "The Mac and Windows apps can be downloaded from each release: Marquee.dmg (open it and drag Marquee into Applications) and Marquee-Setup.exe (installs for your account, no admin needed). Links are in the README and on the website.",
      "Marquee for Mac updates itself: when a new release is out it shows an Update button, then downloads it, checks it, and quits and reopens on the new version. It no longer runs in the App Sandbox, which is what lets it replace itself; your settings come along. After an update you sign in once more.",
      "Marquee for Mac and Windows: profile photos, and notifications that come straight from your server over a live connection (each app asks after you sign in). Windows gets real Windows notifications, its own icon, and Settings › Household members.",
    ],
  },
  {
    version: "0.28.0",
    date: "2026-09-25",
    changes: [
      "Declining a request now asks why: pick a reason from a short list (already on a streaming service you have, not released yet, no space right now, and so on) or write your own. The member sees the reason under Declined on their Requests page and in the notification.",
      "API: POST /requests/{id}/reject takes an optional reason, GET /requests/pending lists the preset reasons, and /requests/mine and /requests/history include rejectionReason.",
      "Marquee for Mac: declining a request offers the same list of reasons, and a declined request shows why.",
      "Hardening from a security review: the sign-in gate no longer lets look-alike paths through (a page's server actions were reachable without signing in), the login limit can't be beaten with a burst of parallel guesses, the admin password reset script now signs browsers out too, Plex sync ignores servers other accounts shared with you, and a Discord relay can no longer @everyone.",
      "A title requested from the website is recorded under its real TMDb name and poster, not whatever the browser sent.",
      "The Docker container now starts with a Postgres password containing /, quotes or $, and an upgrade no longer fails when two identical pending requests were left over from a double click.",
      "A movie and a TV show that happen to share a TMDb id no longer show each other's Plex or Jellyfin file details.",
      "Updated Next.js and the sign-in library to versions with the latest security fixes.",
      "Changing your own password now asks for your current one first, on the website and in the Mac and Windows apps, so a browser left signed in can't be used to lock you out. The admin resetting a member's password still doesn't need theirs.",
      "Posters, backdrops and episode stills show a soft loading shimmer and fade in, instead of sitting as empty boxes until the artwork arrives.",
      "Marquee for Windows has started: an early native Windows app lives in windows/ of the repo, with sign-in, Discover, browsing, title pages, requests (including decline reasons), favorites, calendar and notifications. It isn't packaged for download yet.",
    ],
  },
  {
    version: "0.27.1",
    date: "2026-09-18",
    changes: [
      "Marquee has a website: timmyamant.github.io/marquee — what it does, how it fits in front of Plex, Jellyfin, Sonarr and Radarr, the Mac app, and how to install it. Every film, person and streaming service in its screenshots is made up.",
    ],
  },
  {
    version: "0.27.0",
    date: "2026-09-18",
    changes: [
      "Titles you delete from Plex or Jellyfin now drop out of your library on the next sync, instead of showing \"In library\" forever.",
      "One Sonarr show that TMDb doesn't know no longer stops Marquee from noticing series you've removed from Sonarr.",
      "Opening a person or studio page no longer wipes the backdrops of the titles on it, and popular titles get their details refreshed again.",
      "Household members now get a notification when a title they requested finishes downloading — once per request, not once per episode.",
      "Big Sonarr imports no longer trip the webhook rate limit: only wrong secrets count against it, and a burst of events runs one library sync instead of one each. Webhooks can also send their secret in an X-Marquee-Secret header to keep it out of proxy logs.",
      "ntfy notifications for titles with accents, non-Latin scripts or emoji now arrive instead of silently failing.",
      "Removing a household member, or changing someone's password, now signs them out of the website right away (changing your own password signs you out too).",
      "Hardening: the login rate limit can no longer be dodged with a fake X-Forwarded-For header, first-run setup can't create two admins, and every page sends basic security headers.",
      "Pages now show a loading skeleton while they fetch, a friendly error with a Try again button when TMDb or a server doesn't answer, and a proper Not Found page.",
      "A new daily Database Cleanup job (Settings → Jobs) trims old notifications, activity and disk snapshots, and expired app sign-ins.",
      "Syncs can no longer run on top of each other, and Plex show scanning is gentler on big libraries.",
      "The Docker container now shuts its database down cleanly on docker stop.",
      "Marquee for Mac: right-click any poster or person for Open, Add/Request, Favorite, Copy Link and Open in Browser; title pages have Copy Link and Open in Browser too; posters work with VoiceOver.",
      "Marquee for Mac: clicking a notification while the app is closed now opens that title, the app reconnects on its own when the network returns or the Mac wakes, and a banner shows when the server can't be reached.",
      "Marquee for Mac: a failed page on Movies/Series shows a Retry row instead of ending the list, saving unrelated settings no longer jumps the list back to the top, ⌘F focuses search, and big backdrops use much less memory.",
    ],
  },
  {
    version: "0.26.0",
    date: "2026-09-17",
    changes: [
      "File details now fills in for titles you own through Plex or Jellyfin, not just ones Radarr and Sonarr track: resolution, video codec, dynamic range, audio codec and channels, container and bitrate all come straight from your media server.",
      "Where Radarr or Sonarr also tracks a title, its own quality profile, release group and edition still win — your media server fills in the rest.",
      "Plex shows get the same detail, averaged across their episodes, since Plex only reports a file per episode rather than per series.",
      "Resolution badges light up for media-server-owned titles too, and a plain SDR file no longer gets a badge of its own.",
          "Marquee for Mac shows the same detail, including the new Container and Bitrate rows.",
],
  },
  {
    version: "0.25.0",
    date: "2026-09-17",
    changes: [
      "Studio chips are all the same height now, whether or not the studio has a logo, and they're capsules like the rest of the app.",
      "Marquee for Mac: adding a title from a grid or shelf no longer leaves the card offering \"Add to Radarr\" — the card updates in place, without reloading the page under you.",
    ],
  },
  {
    version: "0.24.3",
    date: "2026-09-17",
    changes: [
      "Documented how to reach Marquee from outside your home network: a Cloudflare Tunnel on your own domain, port forwarding, and putting Authelia or Cloudflare Access in front — including what to exempt so the Mac app and *arr webhooks keep working.",
    ],
  },
  {
    version: "0.24.2",
    date: "2026-09-17",
    changes: [
      "The Docker image is now published to GitHub Packages as well as Docker Hub — pull whichever you prefer.",
    ],
  },
  {
    version: "0.24.1",
    date: "2026-09-17",
    changes: [
      "Marquee for Mac: the notifications popover is wider and grows with the list, so you see every recent notification instead of two.",
    ],
  },
  {
    version: "0.24.0",
    date: "2026-09-17",
    changes: [
      "Marquee for Mac, the native macOS client, now lives in this repository under mac/ — see the README for what it does and how to build it.",
      "Tidied the project: screenshots and the API reference moved under docs/, and the Docker image no longer carries documentation or the Mac app.",
    ],
  },
  {
    version: "0.23.1",
    date: "2026-09-17",
    changes: [
      "The sidebar now shows which Marquee server you're on under your name, matching the Mac app; your role moved to Settings › Account.",
    ],
  },
  {
    version: "0.23.0",
    date: "2026-09-17",
    changes: [
      "Rebuilt the title page and every shelf page to the shared design mockup Marquee for Mac is built from, so the website and the Mac app now lay out identically: a 230px sidebar, left-aligned content with fixed gutters (48px on a title page, 28px on shelf pages) instead of a centered max-width column, and shelves that bleed off the right edge.",
      "The top bar no longer sits on a solid strip of its own — it floats over the page as a 52px blurred scrim that fades out, so a title page's backdrop now fills the window from the very top and runs up behind the search field.",
      "Title pages now use the mockup's three-column geometry — a 224x336 poster, a 546px main column starting level with the title, and a 288px right rail — with the cast carousel beside the rail instead of below it.",
      "The facts card now shows a serif TMDb score with a \"TMDb user score\" label, even 38px fact rows and 36px streaming-service tiles; the file details card became a two-column grid (Size/Runtime, Added/Resolution, Quality profile/Video, Dynamic range/Audio) with a one-line location field and an inline Copy button.",
      "The library badge, Search now, Stop monitoring and Fix ID now sit together on one row of 32px capsules under the title, keywords stay on a single row that fades out rather than wrapping, and credits lead with the person's name over their role.",
      "Shelves got the mockup's head (20px serif title, 20px see-all circle, 28px arrows that dim at either end) and its cards: 156x234 art, 9px type badge, 17px status pill, 3px status strip, and a hover overview with an accent Add button.",
      "The cast row is a real carousel of 112x124 portraits rather than a row of poster-shaped cards, and genre tiles carry the mockup's 34px serif label.",
    ],
  },
  {
    version: "0.22.0",
    date: "2026-09-17",
    changes: [
      "Added a versioned JSON API at /api/v1 so native apps (starting with Marquee for Mac) can use this server as their only backend — everything the website shows and does is reachable through it, including admin settings. See docs/api-v1.md.",
      "Native apps sign in with a per-device token instead of a browser cookie. Tokens expire after 90 days without use, signing out revokes that device's token, and changing or resetting an account's password (in Settings or with the reset-admin-password script) signs every native app out of that account.",
      "Sign-in attempts from native apps count against the same rate limits as the website's sign-in page.",
    ],
  },
  {
    version: "0.21.10",
    date: "2026-07-27",
    changes: [
      "Fixed the mobile menu staying open after tapping a search result — the search dropdown itself closed, but the slide-down hamburger panel around it didn't, since it had its own separate open/close state.",
    ],
  },
  {
    version: "0.21.9",
    date: "2026-07-27",
    changes: [
      "Fixed the header search dropdown staying open after clicking a result or pressing Enter — a suggestion request still in flight from an earlier keystroke could resolve after navigation and silently reopen it.",
    ],
  },
  {
    version: "0.21.8",
    date: "2026-07-23",
    changes: [
      "Increased the left margin on title pages further, and fixed the overview/metadata column overlapping the poster that the wider margin exposed.",
    ],
  },
  {
    version: "0.21.7",
    date: "2026-07-23",
    changes: [
      "Closed the remaining gap between the movie/show title and everything below it (runtime line, library status, overview, sidebar cards) — the poster's height was pushing all of that further down than the title itself needed.",
      "Added a bit more breathing room between the poster artwork and the left edge of the page on title pages.",
    ],
  },
  {
    version: "0.21.6",
    date: "2026-07-23",
    changes: [
      "Moved the rating/status and File details sidebar cards up to align with the title's metadata line instead of starting much lower, next to the overview text.",
    ],
  },
  {
    version: "0.21.5",
    date: "2026-07-23",
    changes: [
      "Moved File details from a full-width section into the title page's sidebar, right below the rating/status card.",
      "Tightened up the gap between the backdrop and the movie/show title on title pages — it now sits right where the backdrop fades out instead of floating further down the page.",
    ],
  },
  {
    version: "0.21.4",
    date: "2026-07-22",
    changes: [
      "Fixed: clicking Marvel Studios, Lucasfilm, Pixar, or 20th Century Studios on Discover's Studios row landed on a page branded \"The Walt Disney Company\" instead of that studio's own page — each now shows its own name, logo, and catalog.",
    ],
  },
  {
    version: "0.21.3",
    date: "2026-07-22",
    changes: [
      "Fixed: unfavoriting a title on the Favorites page, or adding a title to Radarr/Sonarr from its detail page, could leave the page showing stale state until a reload.",
      "Fixed: a double-click or two open tabs could submit the same request twice; the second is now rejected instead of creating a duplicate.",
      "Fixed: a slow/unreachable TMDb or Trakt response had no timeout and could hang a page load indefinitely.",
      "Hardened the Sonarr/Radarr webhook receiver with a timing-safe secret check and rate limiting.",
      "Fixed: a single failed Jellyfin library fetch could abort an entire sync instead of retrying on the next pass.",
    ],
  },
  {
    version: "0.21.2",
    date: "2026-07-22",
    changes: [
      "Fixed: Movies/Series could show the same title twice back to back while scrolling — TMDb's popularity ranking can shift slightly between the initial load and each further page, letting one title land in both. Duplicates are now filtered out as they load.",
    ],
  },
  {
    version: "0.21.1",
    date: "2026-07-22",
    changes: [
      "Fixed: poster grids (Favorites, Search, a person/company's filmography, Movies/Series) left dead space on the right on mobile, since fixed-size cards didn't divide evenly into narrower screens — posters now stretch to fill each row completely.",
    ],
  },
  {
    version: "0.21.0",
    date: "2026-07-22",
    changes: [
      "Added a Settings → About page — version, movies/TV shows tracked, total requests, time zone, and support links.",
      "Added a Settings → Jobs page (admin) — lists the background sync jobs (Plex, Jellyfin, Sonarr/Radarr, disk space) with a manual \"Run Now\" for each.",
      "Added two more notification channels alongside Discord: a generic outgoing webhook and ntfy.sh, both configurable in Settings → Integrations.",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-07-22",
    changes: [
      "Redesigned the movie/show detail page into a two-column layout — tagline, overview, Director/Screenplay (or Creator/Executive Producer) credits, and keyword tags on the left, with a new sidebar showing rating, status, release/air dates, original language, production country, network, and (when available) which streaming services currently carry it.",
      "Recommendations on a title page now show a MOVIE/SERIES badge on each poster, matching Discover.",
      "Fixed: a TV show's season list opened its newest season automatically — every season now starts collapsed until you click it.",
    ],
  },
  {
    version: "0.19.1",
    date: "2026-07-22",
    changes: [
      "Redesigned the Changelog page into a collapsed list of releases (relative date, version, a Latest badge on the newest) — click \"View Changelog\" on any release to see its full change list in a popup instead of everything being expanded on the page at once.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-07-22",
    changes: [
      "Movies and Series now load endlessly as you scroll instead of paging through with a Next button.",
      "Fixed: clicking \"Add to Sonarr/Radarr\" could leave a green \"Added\" label showing indefinitely on a poster even after it was no longer accurate, only clearing on a full page reload.",
    ],
  },
  {
    version: "0.18.6",
    date: "2026-07-21",
    changes: [
      "Fixed: Discover's Studios and Networks logos (e.g. Warner Bros. Pictures) could render as a near-blank shape — the flatten-to-white-silhouette effect crushed some logos' fine detail. Logos now show in their own original colors on a white backdrop instead.",
    ],
  },
  {
    version: "0.18.5",
    date: "2026-07-21",
    changes: [
      "Fixed: Movies/Series could fall short of the full 5 rows (e.g. only 3) when \"Hide titles you already track\" filtered out most of a page's results for an account with a large library — fetches a much bigger batch specifically when that filter is on.",
    ],
  },
  {
    version: "0.18.4",
    date: "2026-07-21",
    changes: [
      "Movies and Series now always show 5 full rows of posters, with no ragged partial row at the bottom — the grid measures how many posters actually fit per row at your screen's width and trims to whole rows automatically.",
    ],
  },
  {
    version: "0.18.3",
    date: "2026-07-21",
    changes: [
      "Movies and Series: poster art is now the same size as Discover's rows, instead of stretching wider to fill each column.",
      "Fixed: the \"Because you watched\" row could go missing from the Movies or Series page on days the rotation happened to land on a title of the other type — it now only rotates through recently-watched titles matching that page's own type.",
    ],
  },
  {
    version: "0.18.2",
    date: "2026-07-21",
    changes: [
      "Fixed: the Search page showed a second search box under the nav bar's own search field, duplicating it — the page's own copy is now removed.",
    ],
  },
  {
    version: "0.18.1",
    date: "2026-07-21",
    changes: [
      "Fixed: a title page's runtime/genres/year/status line, the Coming soon badge, and the Favorite button were laid over the backdrop artwork — they now sit below it, on the plain background, so the artwork only carries the title.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-07-21",
    changes: [
      "Removed the My Library page and its \"stop monitoring\" action — the app no longer has a dedicated page for browsing what you already own.",
      "Removed the homepage — the site now goes straight to Discover instead.",
      "Added Movies and Series pages, each working like Discover's old browse grid but scoped to just movies or just TV.",
      "Redesigned Discover into a page of browsable rows — Recently Added, Trending, Popular Movies, Movie Genres, Upcoming Movies, Studios, Popular Series, Series Genres, Upcoming Series, and Networks — instead of a single filterable grid (that grid now lives at Movies/Series).",
      "Movies/Series: the type, sort, and genre filters are now dropdown menus instead of button rows.",
      "Discover, Movies, and Series now use the full page width instead of a centered column with empty space on the sides.",
      "The left sidebar's nav text is now larger and easier to click.",
    ],
  },
  {
    version: "0.17.2",
    date: "2026-07-21",
    changes: [
      "Fixed: TV shows owned via Plex never showed a file location in File details, since Plex only reports a path per-episode, not for the show itself — a location (the folder every episode shares) is now derived automatically at sync time.",
      "Fixed: a Sonarr-tracked TV show that was only partway through downloading could show a file location/size as if it were already complete — location now only shows once a series is fully owned, matching how movies already worked.",
    ],
  },
  {
    version: "0.17.1",
    date: "2026-07-21",
    changes: [
      "My Library's grid view now shows a title's on-disk file location as a hover tooltip on the poster — useful for spotting a wrong Plex/Jellyfin/Sonarr/Radarr match (wrong artwork/info for what's actually the file on disk) without switching to table view.",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-07-21",
    changes: [
      "Added a light/dark theme toggle (sidebar footer on desktop, nav drawer on mobile) — the app was dark-only before, with a full light palette added alongside it.",
      "Fixed: pages with wide content (e.g. Discover's filter/genre chip rows) could stretch the whole layout wider than the screen on mobile, pushing the header's menu button and notification bell off-screen.",
    ],
  },
  {
    version: "0.16.1",
    date: "2026-07-21",
    changes: [
      "Fixed: the site was missing a viewport meta tag, so mobile browsers rendered the whole page at desktop width and zoomed out instead of using the site's actual responsive layout — pages now render properly on phones.",
      "Settings: the tab nav (Account/Integrations/Activity) now highlights the active section and the page title updates per tab, instead of always saying \"Account.\"",
      "Settings → Integrations: the 9 connection cards are now grouped into labeled sections (Media Libraries, Download Clients, Metadata Sources, Notifications) instead of one long undifferentiated list.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-07-21",
    changes: [
      "Added a persistent left sidebar nav on desktop, replacing the horizontal top bar's nav links — mobile is unaffected, still using the existing hamburger drawer.",
      "Added stat tiles to the homepage: library counts (movies/TV/disk space) and pending request counts, for signed-in users.",
      "Added a Recent Downloads feed to the homepage, pulled from existing Radarr/Sonarr download notifications.",
      "Reworked the Requests page from stacked cards into a proper table (title, requester, date, status/actions) for both the admin queue and members' own request history.",
    ],
  },
  {
    version: "0.15.2",
    date: "2026-07-21",
    changes: [
      "Fixed: the nav search box's suggestions dropdown stayed open on top of the destination page after pressing Enter or clicking a result — a suggestion fetch still in flight at that moment could resolve after navigation and reopen it, since the search bar lives in the shared nav and never unmounts between pages.",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-07-21",
    changes: [
      "Fixed: the Add-to-Radarr/Sonarr, Request, and Stop-monitoring buttons on poster cards (filmography, franchise rows, Discover, My Library) only appeared on mouse hover, making them invisible and unusable on phones/tablets — now visible by default and hover-hidden only on devices that actually have a mouse.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-07-19",
    changes: [
      "Added per-member auto-approval for requests (Settings → household member edit) — the admin can now let a trusted member's movie and/or TV requests skip the manual approval queue and go straight to Radarr/Sonarr.",
      "Added a recovery command for a locked-out admin account with no other way in: `docker exec -it <container> npm run reset-admin-password -- <new-password>` (documented in the README).",
      "Fixed: a title already requested still showed a \"Request\" button again (instead of \"Requested\") in the Collection and \"More like this\" rows on its own title page.",
      "Fixed: favoriting a person or company directly from a Cast/Studio row (without visiting their own page first) saved the favorite but silently left it missing from the Favorites page.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-07-19",
    changes: [
      "Added \"Search now\" and a monitoring on/off toggle (admin-only) to title pages tracked in Radarr/Sonarr — trigger an immediate search or pause/resume monitoring without leaving Marquee for the *arr app itself.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-07-18",
    changes: [
      "Added Discord webhook notifications (Settings → Integrations) — post a message to a channel whenever something is grabbed, downloaded, or a request is approved/rejected, mirroring the existing in-app notifications.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-07-18",
    changes: [
      "Added duplicate-file detection to My Library — when an arr app and a media server both report a different file path for the same title, it's flagged as a possible duplicate with a filter toggle to find them all.",
      "Added HDR (HDR10/HDR10+/Dolby Vision) and audio codec (including Atmos) badges next to the existing resolution badge, for Radarr-owned movies.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-07-18",
    changes: [
      "Added an automated test suite (Vitest, 83 tests) covering ownership status derivation, the title cache's staleness/completeness policy, ID parsing (Plex/Jellyfin/Trakt guids), and the year-range/status-label logic — the exact areas that produced real bugs earlier this session. No user-facing change, but the sync-status and cache logic is now regression-tested going forward.",
    ],
  },
  {
    version: "0.10.3",
    date: "2026-07-18",
    changes: [
      "Fixed: \"Wrong match? Fix ID\" corrections were silently reverted by the next Plex/Jellyfin/Sonarr/Radarr sync (as soon as 15 minutes later), since sync always re-derives a title's match fresh from the source and had no way to know it had been manually corrected. Corrections now persist across every future sync.",
      "Fixed: a title permanently missing its backdrop, poster, or overview on TMDb (common for older or niche titles) was re-fetched and re-written to the database on every single page view, forever, instead of settling back into the normal 14-day cache after a few days of retrying.",
      "Fixed: a TV show with an end date but no start date on TMDb could render \"null–2020\" as its year range.",
      "The relink action's database updates are now atomic (all-or-nothing) instead of able to partially apply on failure.",
    ],
  },
  {
    version: "0.10.2",
    date: "2026-07-18",
    changes: [
      "Fixed: a title with a poster and overview but no backdrop image yet (common for very new releases) never retried fetching it, leaving the hero background blank forever — backdrop is now included in the same \"keep re-checking until TMDb has it\" logic as poster/overview.",
      "Removed the small file-info line below the Add/Owned badge on title pages — it duplicated the fuller File details section below.",
    ],
  },
  {
    version: "0.10.1",
    date: "2026-07-18",
    changes: [
      "Added a \"Wrong match? Fix ID\" option (admin-only) on owned titles' pages — enter the correct TMDb, IMDb, or TVDB id and Marquee repoints everything synced under the wrong id to the right title, without needing to fix the match in Plex/Jellyfin/Sonarr itself first.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-07-18",
    changes: [
      "Added TheTVDB as a metadata source: new Settings → Integrations card (free API key) that fills in a TV show's poster and overview when TMDb doesn't have them yet, plus a \"TheTVDB\" link on title pages.",
      "Title pages now show runtime, rating, genres, year range, status (Continuing/Ended/etc.), and network alongside the existing overview and trailer/social links.",
    ],
  },
  {
    version: "0.9.2",
    date: "2026-07-18",
    changes: [
      "Fixed a permanent-poisoning bug in TV show ID resolution: once a Plex/Jellyfin show's TVDB id had ever been resolved to the wrong TMDb id (e.g. because of a wrongly-named library folder), it kept returning that same wrong match forever, even after the source metadata was corrected. TVDB-to-TMDb resolution now always re-checks with TMDb directly instead of trusting a previously-cached mapping.",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-07-18",
    changes: [
      "Fixed: some titles kept showing no poster or overview for up to 14 days even after TMDb had filled them in. Titles are cached before TMDb finishes uploading artwork for very new or niche releases — the cache now treats a missing poster/overview as stale regardless of age, so it keeps re-checking until TMDb actually has the data instead of locking in the incomplete version.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-18",
    changes: [
      "Added a thin Sonarr-style colored status bar across the bottom of every poster: green for owned, blue for downloading, red for missing/monitored, purple for coming soon, yellow for untracked — readable at a glance across a whole grid without reading each badge.",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-07-18",
    changes: [
      "Removed the duplicate search bar on My Library — the one in the nav header already covers it.",
      "Tightened the extra vertical gap left behind on My Library after the last header cleanup.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-07-18",
    changes: [
      "Removed the redundant page title/description under Requests, Favorites, My Library, and Discover — the nav already shows which page you're on.",
      "Sped up title-page loads: several Radarr/Sonarr/Plex/Jellyfin lookups that used to run one after another now run in parallel, cutting out a full extra network round-trip on TV shows owned via Plex or Jellyfin.",
      "Added a database index on requests.requested_by_user_id, used by every member's Requests tab and duplicate-request check.",
    ],
  },
  {
    version: "0.7.3",
    date: "2026-07-18",
    changes: [
      "Fixed: tapping into a search box or form field on mobile made the whole app appear zoomed in until manually pinching back out. iOS Safari auto-zooms the page when a focused input's text is under 16px, and several inputs used a smaller compact size — every text input is now at least 16px on phone-sized screens.",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-07-18",
    changes: [
      "Fixed: household members saw the admin's \"Add to Radarr/Sonarr\" quick-add button (and got an \"Only the admin can add titles\" error on click) in the Missing from collections tab and the franchise/\"More like this\" sections on title pages — they now get a Request button instead, same as everywhere else in the app.",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-07-18",
    changes: [
      "Fixed: pages could hang for up to a minute if Plex, Jellyfin, Sonarr, or Radarr was slow or unreachable — every request to those services now times out after 8 seconds instead of waiting indefinitely.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-07-18",
    changes: [
      "File details for TV shows owned via Plex/Jellyfin now falls back to Sonarr's series folder path and quality profile name when Sonarr also tracks the same show, instead of showing only size and added date.",
      "Backfilled the changelog with the project's full history from v0.1.0 onward.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-18",
    changes: [
      "Added a File details section above Cast on title pages: location (with copy-to-clipboard), size, runtime, and — for Radarr-owned movies — resolution, video codec, HDR/dynamic range, audio, quality profile, edition, and release group.",
      "Fixed: file details now also show for titles owned via Plex or Jellyfin, not just Radarr/Sonarr.",
      "Added a version number to the footer, linking to this changelog.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-07-18",
    changes: [
      "Added an \"Approve all\" button to the Requests page.",
      "Added a plain-language error reference page (/help/errors), linked from the footer.",
      "Added \"Manually approve\" for TV requests Sonarr can't resolve automatically, with a direct link to add the show in Sonarr.",
      "Added a \"Missing from collections\" tab to My Library — franchises you own part of but not all of.",
      "Added 4K/1080p/720p resolution badges on owned Radarr movies.",
      "Added a household Activity feed (Settings → Activity).",
      "Added Trakt list/watchlist import as pending requests.",
      "Added storage forecasting (\"free space runs out in ~N days\") to My Library.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-17",
    changes: [
      "Centralized library-owner resolution and admin authorization checks across the app.",
      "Replaced email-based login with username-based login.",
      "Added full Jellyfin support as a second, independent media-server integration alongside Plex.",
      "Added a Disconnect option for every integration (Plex, Jellyfin, Sonarr, Radarr), plus sync-count display on the Jellyfin card.",
      "Added a \"Surprise me\" button to Discover.",
      "Fixed the homepage \"Coming soon\" row showing titles that had already been released.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-16",
    changes: [
      "Added the household request/approval flow: members request titles, the admin approves or declines from the Requests page.",
      "Added Favorites for movies, TV shows, and collections, with favorite and quick-add buttons throughout the app.",
      "Added a release Calendar — a full month-grid of upcoming releases and air dates.",
      "Added a Sonarr-style expandable season/episode accordion with have/missing status per episode.",
      "Added Sonarr/Radarr webhook-driven notifications.",
      "Added real download-queue status (\"Downloading\") instead of just \"Monitored.\"",
      "Added on-disk file location and remaining disk space to My Library.",
      "Added an \"Add all missing\" bulk button to franchise/collection rows.",
      "Added a manual \"Sync now\" button to Settings → Integrations.",
      "Added mobile navigation and fixed various responsive/overflow issues.",
      "Fixed several correctness/security issues found in review: an admin-role downgrade bug, an IDOR gap, a request-approval race condition, and stale library status after unmonitoring.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-15",
    changes: [
      "Added Favorites for people and studios.",
      "Switched to a single self-hosted Docker image with Postgres bundled inside (previously two containers).",
      "Added a locked-down first-run setup flow — no public signup page.",
      "Added movie/TV franchise and collection sections to title pages.",
      "Added a TMDb settings UI (test-and-save API key/token) in Settings → Integrations.",
      "Added a native Unraid Community Applications template.",
      "Fixed TMDb token verification rejecting valid v3 API keys, Discover's row layout, and polished Person/Company pages.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-14",
    changes: [
      "Initial release: TMDb-powered discovery, search, and title pages with live Plex/Sonarr/Radarr ownership status.",
    ],
  },
];
