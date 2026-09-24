use crate::store;
use serde_json::{Map, Value};
use std::cell::RefCell;

/// One flat JSON file of settings. Keys can be dynamic (zoom.<host>), so no GSettings schema.
pub struct Prefs {
    values: RefCell<Map<String, Value>>,
}

impl Prefs {
    pub fn load() -> Self {
        let values = store::read(&Self::path()).unwrap_or_default();
        Prefs { values: RefCell::new(values) }
    }

    fn path() -> std::path::PathBuf {
        store::config_dir().join("settings.json")
    }

    pub fn string(&self, key: &str, default: &str) -> String {
        self.values.borrow().get(key).and_then(Value::as_str).unwrap_or(default).to_string()
    }

    pub fn bool(&self, key: &str, default: bool) -> bool {
        self.values.borrow().get(key).and_then(Value::as_bool).unwrap_or(default)
    }

    pub fn number(&self, key: &str, default: f64) -> f64 {
        self.values.borrow().get(key).and_then(Value::as_f64).unwrap_or(default)
    }

    pub fn set(&self, key: &str, value: impl Into<Value>) {
        self.values.borrow_mut().insert(key.to_string(), value.into());
        store::write(&Self::path(), &*self.values.borrow());
    }

    pub fn engine(&self) -> (String, String) {
        (self.string("search.engine", "google"), self.string("search.custom", ""))
    }
}
