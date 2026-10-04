// What a page is about, for keeping related tabs together: a code repository or a package is a topic, and
// a page that names it belongs to it. No DOM; tested in test/.

const REPO_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org', 'sr.ht', 'git.sr.ht']
const PACKAGES = [
  [/^(www\.)?npmjs\.com$/, /^\/package\/((?:@[^/]+\/)?[^/]+)/],
  [/^pypi\.org$/, /^\/project\/([^/]+)/],
  [/^crates\.io$/, /^\/crates\/([^/]+)/]
]
// Owner paths on code hosts that aren't repositories.
const NOT_OWNERS = new Set(['orgs', 'settings', 'marketplace', 'explore', 'topics', 'search', 'notifications', 'sponsors', 'features', 'about', 'login', 'users', 'dashboard'])
// ponytail: names this short or this common relate half the web; a word list instead of a frequency model.
const TOO_COMMON = new Set(['app', 'apps', 'docs', 'test', 'tests', 'site', 'blog', 'home', 'core', 'main', 'code', 'demo', 'web', 'www', 'api', 'lib', 'src', 'dotfiles', 'config'])

function parse (url) {
  try { return new URL(url) } catch { return null }
}
// A path with a stray % is still read, just undecoded.
function decoded (path) {
  try { return decodeURIComponent(path) } catch { return path }
}

/** The topic a page is the home of — a repository or a package — as { key, name }, or null. */
export function topicOf (url) {
  const u = parse(url || '')
  if (!u || !/^https?:$/.test(u.protocol)) return null
  const host = u.hostname.replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  if (REPO_HOSTS.includes(host) && parts.length >= 2 && !NOT_OWNERS.has(parts[0].toLowerCase())) {
    const name = parts[1].replace(/\.git$/, '')
    return { key: `${host}/${parts[0]}/${name}`.toLowerCase(), name: name.toLowerCase() }
  }
  for (const [hosts, path] of PACKAGES) {
    const m = hosts.test(host) && u.pathname.match(path)
    if (m) return { key: `${host}/${m[1]}`.toLowerCase(), name: m[1].replace(/^@[^/]+\//, '').toLowerCase() }
  }
  return null
}

const words = text => (text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
// A name of several words ("my-tool") must show up as those words in a row.
function mentions (text, name) {
  const want = words(name)
  const have = words(text)
  for (let i = 0; i + want.length <= have.length; i++) if (want.every((w, j) => have[i + j] === w)) return true
  return false
}

/** Whether a page (its address and title) belongs to a topic: its own pages, or a page that names it. */
export function belongs (topic, url, title) {
  if (!topic) return false
  const own = topicOf(url)
  if (own) return own.key === topic.key
  if (topic.name.length < 3 || TOO_COMMON.has(topic.name)) return false
  const u = parse(url || '')
  if (!u) return false
  return mentions(`${u.hostname} ${decoded(u.pathname)}`, topic.name) || mentions(title, topic.name)
}
