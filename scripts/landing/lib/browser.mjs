// Headless Chromium through Playwright (pinned in scripts/landing/package.json).
export async function launchBrowser() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error(
      'Playwright is missing. Install the render tooling once with:\n' +
        '  npm install --prefix scripts/landing\n' +
        'and, if Chromium itself is missing:\n' +
        '  npx --prefix scripts/landing playwright install chromium',
    );
  }
  const chromium = playwright.chromium ?? playwright.default.chromium;
  return chromium.launch();
}
