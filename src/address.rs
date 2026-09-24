use gtk::glib::{Uri, UriFlags};

const OURS: [&str; 5] = ["http", "https", "file", "about", "data"];

/// What was typed, as a URL — or nothing, if it can't be a place.
pub fn url(typed: &str) -> Option<String> {
    let text = typed.trim();
    if text.is_empty() || text.contains(' ') {
        return None;
    }
    let lower = text.to_lowercase();
    if let Some(split) = text.find("://") {
        return OURS.contains(&lower[..split].as_ref()).then(|| text.to_string());
    }
    if lower.starts_with("about:") || lower.starts_with("data:") {
        return Some(text.to_string());
    }
    let head = text.split(['/', '?', '#']).next().unwrap_or(text);
    if head.contains('@') {
        return None;
    }
    let host = head.split(':').next().unwrap_or(head).to_lowercase();
    if !looks_like_host(&host) {
        return None;
    }
    // A local server almost never has a certificate.
    let local = host == "localhost"
        || host.ends_with(".localhost")
        || host == "127.0.0.1"
        || host == "0.0.0.0"
        || host.starts_with("192.168.")
        || host.starts_with("10.");
    Some(format!("{}{text}", if local { "http://" } else { "https://" }))
}

fn looks_like_host(host: &str) -> bool {
    if host == "localhost" {
        return true;
    }
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() == 4 && labels.iter().all(|l| l.parse::<u8>().is_ok()) {
        return true;
    }
    if labels.len() < 2 {
        return false;
    }
    let fine = |l: &&str| {
        !l.is_empty()
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.chars().all(|c| c.is_alphanumeric() || c == '-')
    };
    if !labels.iter().all(fine) {
        return false;
    }
    // Ending in digits is a version number, not a domain.
    let tld = labels[labels.len() - 1];
    tld.chars().count() >= 2 && tld.chars().all(char::is_alphabetic)
}

pub fn host(url: &str) -> Option<String> {
    let host = Uri::parse(url, UriFlags::NONE).ok()?.host()?.to_lowercase();
    (!host.is_empty()).then_some(host)
}

pub fn bare_host(url: &str) -> Option<String> {
    host(url).map(|h| h.strip_prefix("www.").map(str::to_string).unwrap_or(h))
}

/// Host without www, plus the path unless it is just "/".
pub fn pretty(url: &str) -> String {
    let Ok(uri) = Uri::parse(url, UriFlags::NONE) else { return url.to_string() };
    let Some(host) = uri.host().filter(|h| !h.is_empty()) else { return url.to_string() };
    let bare = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let path = uri.path();
    if path.is_empty() || path == "/" { bare } else { bare + path.as_str() }
}

pub fn is_web(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_text_becomes_a_place_or_nothing() {
        assert_eq!(url("github.com").as_deref(), Some("https://github.com"));
        assert_eq!(url("  example.com/a?b#c ").as_deref(), Some("https://example.com/a?b#c"));
        assert_eq!(url("localhost:3000").as_deref(), Some("http://localhost:3000"));
        assert_eq!(url("192.168.1.10/admin").as_deref(), Some("http://192.168.1.10/admin"));
        assert_eq!(url("HTTP://x.org").as_deref(), Some("HTTP://x.org"));
        assert_eq!(url("about:blank").as_deref(), Some("about:blank"));
        assert_eq!(url("hello world"), None);
        assert_eq!(url("todo"), None);
        assert_eq!(url("version 1.2.3"), None);
        assert_eq!(url("1.2.3"), None);
        assert_eq!(url("me@example.com"), None);
        assert_eq!(url("ftp://x.org"), None);
        assert_eq!(url("-bad.com"), None);
        assert_eq!(pretty("https://www.github.com/"), "github.com");
        assert_eq!(pretty("https://github.com/a/b"), "github.com/a/b");
    }
}
