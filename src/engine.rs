use crate::address;

pub const ENGINES: [(&str, &str, &str); 8] = [
    ("google", "Google", "https://www.google.com/search?q=%s"),
    ("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s"),
    ("bing", "Bing", "https://www.bing.com/search?q=%s"),
    ("ecosia", "Ecosia", "https://www.ecosia.org/search?q=%s"),
    ("startpage", "Startpage", "https://www.startpage.com/sp/search?query=%s"),
    ("kagi", "Kagi", "https://kagi.com/search?q=%s"),
    ("brave", "Brave Search", "https://search.brave.com/search?q=%s"),
    ("qwant", "Qwant", "https://www.qwant.com/?q=%s"),
];

/// A custom template counts only if it is http(s), holds %s, and %s isn't part of the host.
fn custom_host(template: &str) -> Option<String> {
    let t = template.trim();
    if !t.contains("%s") {
        return None;
    }
    let a = address::host(&t.replace("%s", "a"))?;
    let b = address::host(&t.replace("%s", "b"))?;
    let web = t.to_lowercase().starts_with("http://") || t.to_lowercase().starts_with("https://");
    (web && a == b).then_some(a)
}

pub fn template(engine: &str, custom: &str) -> String {
    if engine == "custom" && custom_host(custom).is_some() {
        return custom.trim().to_string();
    }
    let found = ENGINES.iter().find(|e| e.0 == engine).unwrap_or(&ENGINES[0]);
    found.2.to_string()
}

pub fn name(engine: &str, custom: &str) -> String {
    if engine == "custom" {
        if let Some(host) = custom_host(custom) {
            return host.strip_prefix("www.").map(str::to_string).unwrap_or(host);
        }
    }
    ENGINES.iter().find(|e| e.0 == engine).unwrap_or(&ENGINES[0]).1.to_string()
}

pub fn url(text: &str, template: &str) -> Option<String> {
    let words = text.trim();
    if words.is_empty() {
        return None;
    }
    let escaped: String = words
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    Some(template.replace("%s", &escaped))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn searches_are_escaped_and_custom_templates_checked() {
        assert_eq!(
            url("rust gtk & co", &template("google", "")).as_deref(),
            Some("https://www.google.com/search?q=rust%20gtk%20%26%20co")
        );
        assert_eq!(template("custom", "https://s.example/?q=%s"), "https://s.example/?q=%s");
        assert_eq!(template("custom", "https://%s.example/"), ENGINES[0].2);
        assert_eq!(name("custom", "https://www.s.example/?q=%s"), "s.example");
        assert_eq!(name("nope", ""), "Google");
    }
}
