// The shield: Search's own list of ad and tracking hosts, blocked when a page loads them from another site, and
// the boxes they leave behind, hidden. Both shells get it through L.configure.

export const BLOCKED = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'googletagservices.com',
  'google-analytics.com', 'googletagmanager.com', 'adservice.google.com', 'amazon-adsystem.com', 'adnxs.com',
  'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'smartadserver.com', 'sharethrough.com', 'indexww.com', 'bidswitch.net',
  '33across.com', 'teads.tv', 'moatads.com', 'adroll.com', 'scorecardresearch.com', 'quantserve.com',
  'chartbeat.com', 'hotjar.com', 'mouseflow.com', 'fullstory.com', 'clarity.ms', 'mixpanel.com', 'amplitude.com',
  'segment.com', 'segment.io', 'branch.io', 'appsflyer.com', 'adjust.com', 'analytics.tiktok.com',
  'connect.facebook.net', 'ads-twitter.com', 'analytics.twitter.com']

export const HIDE = '.adsbygoogle, ins.adsbygoogle, [id^="google_ads_"], [id^="div-gpt-ad"], [id^="taboola-"], #taboola-below-article, ' +
  'iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"], iframe[src*="amazon-adsystem"] { display: none !important; }'
