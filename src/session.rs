use crate::store;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
pub struct Saved {
    pub tabs: Vec<SavedTab>,
    pub active: usize,
}

#[derive(Serialize, Deserialize)]
pub struct SavedTab {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

pub fn read() -> Saved {
    store::read(&store::file("session.json")).unwrap_or_default()
}

pub fn write(saved: &Saved) {
    store::write(&store::file("session.json"), saved);
}
