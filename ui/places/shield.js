// The shield: Search's own list of ad and tracking hosts, blocked when a page loads them from another site, the
// boxes they leave behind, hidden, and the sites that may not send anyone elsewhere. Both shells get it through
// L.configure.

export const BLOCKED = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'googletagservices.com',
  'google-analytics.com', 'googletagmanager.com', 'adservice.google.com', 'amazon-adsystem.com', 'adnxs.com',
  'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'smartadserver.com', 'sharethrough.com', 'indexww.com', 'bidswitch.net',
  '33across.com', 'teads.tv', 'moatads.com', 'adroll.com', 'scorecardresearch.com', 'quantserve.com',
  'chartbeat.com', 'hotjar.com', 'mouseflow.com', 'fullstory.com', 'clarity.ms', 'mixpanel.com', 'amplitude.com',
  'segment.com', 'segment.io', 'branch.io', 'appsflyer.com', 'adjust.com', 'analytics.tiktok.com',
  'connect.facebook.net', 'ads-twitter.com', 'analytics.twitter.com',
  // aniworld.to's popunder tags, found 2026-10-12; their domains rotate, the guard below is what holds.
  'al5sm.com', 'nap5k.com']

// Sites whose ads open other sites on a click: no popup and no navigation of their tab may leave the site,
// unless the owner typed it. The owner's list (pref shield.guarded) starts as this one.
export const GUARDED = ['aniworld.to']

/** A per-site list with `site` in it or out of it, sorted, without duplicates. */
export function withSite (list, site, on) {
  const rest = list.filter(x => x !== site)
  return on ? [...rest, site].sort() : rest
}

export const HIDE = '.adsbygoogle, ins.adsbygoogle, [id^="google_ads_"], [id^="div-gpt-ad"], [id^="taboola-"], #taboola-below-article, ' +
  'iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"], iframe[src*="amazon-adsystem"] { display: none !important; }'
