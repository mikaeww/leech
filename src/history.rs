use crate::{address, store};
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Open,
    Visited,
    Known,
    Search,
}

#[derive(Clone, Debug)]
pub struct Suggestion {
    pub key: String,
    pub title: String,
    pub url: String,
    pub kind: Kind,
    pub tab: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Visit {
    url: String,
    key: String,
    title: String,
    count: u32,
    last: f64,
}

#[derive(Default)]
pub struct History {
    visits: RefCell<HashMap<String, Visit>>,
    saving: Cell<bool>,
}

impl History {
    pub fn load() -> Rc<Self> {
        let list: Vec<Visit> = store::read(&store::file("history.json")).unwrap_or_default();
        let history = History::default();
        *history.visits.borrow_mut() = list.into_iter().map(|v| (v.key.clone(), v)).collect();
        Rc::new(history)
    }

    pub fn record(self: &Rc<Self>, url: &str, title: &str) {
        if !address::is_web(url) {
            return;
        }
        let key = address::pretty(url).to_lowercase();
        if key.is_empty() {
            return;
        }
        let now = store::now();
        {
            let mut visits = self.visits.borrow_mut();
            // A deep page is also a visit to the site, so three letters offer the front door.
            if key.contains('/') {
                if let Some(root) = address::bare_host(url) {
                    let home = visits.entry(root.clone()).or_insert_with(|| Visit {
                        url: format!("https://{root}/"),
                        key: root,
                        title: String::new(),
                        count: 0,
                        last: now,
                    });
                    home.count += 1;
                    home.last = now;
                }
            }
            let seen = visits.entry(key.clone()).or_insert_with(|| Visit {
                url: url.to_string(),
                key,
                title: String::new(),
                count: 0,
                last: now,
            });
            seen.count += 1;
            seen.last = now;
            seen.url = url.to_string();
            if !title.is_empty() {
                seen.title = title.to_string();
            }
        }
        self.save();
    }

    pub fn retitle(self: &Rc<Self>, url: &str, title: &str) {
        let key = address::pretty(url).to_lowercase();
        let changed = match self.visits.borrow_mut().get_mut(&key) {
            Some(seen) if !title.is_empty() && seen.title != title => {
                seen.title = title.to_string();
                true
            }
            _ => false,
        };
        if changed {
            self.save();
        }
    }

    pub fn suggestions(&self, typed: &str, limit: usize) -> Vec<Suggestion> {
        suggest(&self.visits.borrow(), typed, limit, store::now())
    }

    fn save(self: &Rc<Self>) {
        if self.saving.replace(true) {
            return;
        }
        let this = Rc::downgrade(self);
        gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(1500), move || {
            let Some(this) = this.upgrade() else { return };
            this.saving.set(false);
            this.flush();
        });
    }

    pub fn flush(&self) {
        let now = store::now();
        let mut list: Vec<Visit> = self.visits.borrow().values().cloned().collect();
        list.sort_by(|a, b| frecency(b, now).total_cmp(&frecency(a, now)));
        list.truncate(2000);
        store::write(&store::file("history.json"), &list);
    }
}

fn frecency(v: &Visit, now: f64) -> f64 {
    let days = ((now - v.last) / 86_400.0).max(0.0);
    v.count as f64 * (-days / 30.0).exp()
}

fn strip(typed: &str) -> String {
    let mut text = typed.trim().to_lowercase();
    for scheme in ["https://", "http://"] {
        if let Some(rest) = text.strip_prefix(scheme) {
            text = rest.to_string();
        }
    }
    text.strip_prefix("www.").map(str::to_string).unwrap_or(text)
}

fn rank(key: &str, needle: &str) -> Option<f64> {
    if key.starts_with(needle) {
        return Some(6.0);
    }
    let host = key.split('/').next().unwrap_or(key);
    if let Some((_, after)) = host.split_once('.') {
        if after.starts_with(needle) {
            return Some(3.0);
        }
    }
    // One letter matching inside a name turns "x" into netflix.com.
    if needle.chars().count() >= 2 && host.contains(needle) {
        return Some(2.0);
    }
    None
}

fn suggest(visits: &HashMap<String, Visit>, typed: &str, limit: usize, now: f64) -> Vec<Suggestion> {
    let needle = strip(typed);
    if needle.is_empty() {
        return vec![];
    }
    let mut scored: Vec<(Suggestion, f64)> = vec![];
    for v in visits.values() {
        let Some(r) = rank(&v.key, &needle) else { continue };
        let front = if v.key.contains('/') { 0.0 } else { 1.5 };
        let s = Suggestion { key: v.key.clone(), title: v.title.clone(), url: v.url.clone(), kind: Kind::Visited, tab: None };
        scored.push((s, r + 4.0 + frecency(v, now) + front));
    }
    for (key, title) in KNOWN {
        if visits.contains_key(*key) {
            continue;
        }
        let Some(r) = rank(key, &needle) else { continue };
        let s = Suggestion { key: key.to_string(), title: title.to_string(), url: format!("https://{key}"), kind: Kind::Known, tab: None };
        scored.push((s, r));
    }
    scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.key.len().cmp(&b.0.key.len())));
    scored.into_iter().take(limit).map(|s| s.0).collect()
}

/// The rest of the first offered key that starts with what was typed.
pub fn completion(typed: &str, among: &[Suggestion]) -> Option<String> {
    let lower = typed.to_lowercase();
    if lower.chars().count() < 2 {
        return None;
    }
    let hit = among.iter().find(|s| s.kind != Kind::Open && s.key.starts_with(&lower))?;
    let rest = &hit.key[lower.len()..];
    (!rest.is_empty()).then(|| rest.to_string())
}

const KNOWN: &[(&str, &str)] = &[
    ("google.com", "Google"), ("mail.google.com", "Gmail"),
    ("drive.google.com", "Google Drive"), ("calendar.google.com", "Google Calendar"),
    ("maps.google.com", "Google Maps"), ("youtube.com", "YouTube"),
    ("github.com", "GitHub"), ("figma.com", "Figma"), ("vercel.com", "Vercel"),
    ("notion.so", "Notion"), ("linear.app", "Linear"), ("slack.com", "Slack"),
    ("discord.com", "Discord"), ("x.com", "X"), ("linkedin.com", "LinkedIn"),
    ("instagram.com", "Instagram"), ("reddit.com", "Reddit"),
    ("news.ycombinator.com", "Hacker News"), ("stackoverflow.com", "Stack Overflow"),
    ("claude.ai", "Claude"), ("chatgpt.com", "ChatGPT"),
    ("dribbble.com", "Dribbble"), ("behance.net", "Behance"),
    ("awwwards.com", "Awwwards"), ("mobbin.com", "Mobbin"),
    ("are.na", "Are.na"), ("pinterest.com", "Pinterest"), ("framer.com", "Framer"),
    ("webflow.com", "Webflow"), ("archlinux.org", "Arch Linux"),
    ("wiki.archlinux.org", "ArchWiki"), ("aur.archlinux.org", "AUR"),
    ("crates.io", "crates.io"), ("docs.rs", "Docs.rs"), ("npmjs.com", "npm"),
    ("supabase.com", "Supabase"), ("stripe.com", "Stripe"),
    ("cloudflare.com", "Cloudflare"), ("netlify.com", "Netlify"),
    ("spotify.com", "Spotify"), ("twitch.tv", "Twitch"),
    ("wikipedia.org", "Wikipedia"), ("deepl.com", "DeepL"),
    ("amazon.de", "Amazon"), ("ebay.de", "eBay"), ("spiegel.de", "Der Spiegel"),
];

#[cfg(test)]
mod tests {
    use super::*;

    fn visit(key: &str, count: u32, days_ago: f64) -> (String, Visit) {
        let v = Visit { url: format!("https://{key}"), key: key.into(), title: String::new(), count, last: 1e9 - days_ago * 86_400.0 };
        (key.into(), v)
    }

    #[test]
    fn front_doors_and_frecency_win() {
        let visits: HashMap<_, _> = [visit("github.com", 3, 0.0), visit("github.com/a/b", 9, 0.0), visit("gitlab.com", 1, 90.0)].into();
        let got = suggest(&visits, "git", 3, 1e9);
        let keys: Vec<&str> = got.iter().map(|s| s.key.as_str()).collect();
        assert_eq!(keys[0], "github.com/a/b");
        assert!(keys.contains(&"github.com"));
        assert_eq!(completion("gi", &got).as_deref(), Some("thub.com/a/b"));
        assert!(suggest(&visits, "hub", 3, 1e9).iter().any(|s| s.key == "github.com"));
        assert!(suggest(&visits, "", 3, 1e9).is_empty());
        assert_eq!(suggest(&HashMap::new(), "wiki", 1, 1e9)[0].key, "wikipedia.org");
    }
}
