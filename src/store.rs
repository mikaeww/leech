use serde::Serialize;
use serde::de::DeserializeOwned;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// LEECH_DATA_DIR sends data, settings and WebKit storage to one throwaway folder, for tests.
fn probe() -> Option<PathBuf> {
    std::env::var_os("LEECH_DATA_DIR").map(PathBuf::from)
}

pub fn data_dir() -> PathBuf {
    probe().unwrap_or_else(|| gtk::glib::user_data_dir().join("leech"))
}

pub fn config_dir() -> PathBuf {
    probe().map(|p| p.join("config")).unwrap_or_else(|| gtk::glib::user_config_dir().join("leech"))
}

pub fn cache_dir() -> PathBuf {
    probe().map(|p| p.join("cache")).unwrap_or_else(|| gtk::glib::user_cache_dir().join("leech"))
}

pub fn file(name: &str) -> PathBuf {
    data_dir().join(name)
}

pub fn now() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

/// A missing file is `None`; a file that doesn't parse is moved aside, never overwritten.
pub fn read<T: DeserializeOwned>(path: &Path) -> Option<T> {
    let bytes = std::fs::read(path).ok()?;
    match serde_json::from_slice(&bytes) {
        Ok(value) => Some(value),
        Err(err) => {
            eprintln!("leech: {} is unreadable ({err}), moving it aside", path.display());
            quarantine(path);
            None
        }
    }
}

fn quarantine(path: &Path) {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let aside = path.with_file_name(format!("{stem}.unreadable-{}.json", now() as u64));
    let _ = std::fs::rename(path, aside);
}

pub fn write<T: Serialize + ?Sized>(path: &Path, value: &T) {
    let result = (|| -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(value)?)?;
        std::fs::rename(tmp, path)
    })();
    if let Err(err) = result {
        eprintln!("leech: couldn't write {}: {err}", path.display());
    }
}
