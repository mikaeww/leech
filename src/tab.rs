use crate::address;
use std::cell::{Cell, RefCell};

pub struct Tab {
    pub id: u64,
    pub title: RefCell<Option<String>>,
    pub address: RefCell<Option<String>>,
    pub loading: Cell<bool>,
    pub can_back: Cell<bool>,
    pub can_forward: Cell<bool>,
    /// Shown in place of the page when a load fails.
    pub failure: RefCell<Option<String>>,
    /// Set while asleep: the address to load once the tab is shown.
    pub pending: RefCell<Option<String>>,
    pub pin: RefCell<Option<String>>,
    pub name: RefCell<Option<String>>,
    pub touched: Cell<f64>,
    pub opener: Cell<Option<u64>>,
    pub web: RefCell<Option<webkit6::WebView>>,
}

impl Tab {
    pub fn new(id: u64) -> Self {
        Tab {
            id,
            title: RefCell::new(None),
            address: RefCell::new(None),
            loading: Cell::new(false),
            can_back: Cell::new(false),
            can_forward: Cell::new(false),
            failure: RefCell::new(None),
            pending: RefCell::new(None),
            pin: RefCell::new(None),
            name: RefCell::new(None),
            touched: Cell::new(crate::store::now()),
            opener: Cell::new(None),
            web: RefCell::new(None),
        }
    }

    pub fn is_blank(&self) -> bool {
        self.address.borrow().is_none() && self.pending.borrow().is_none()
    }

    /// Where the tab is, awake or asleep.
    pub fn url(&self) -> Option<String> {
        self.pending.borrow().clone().or_else(|| self.address.borrow().clone())
    }

    pub fn label(&self) -> String {
        if let Some(name) = self.name.borrow().as_ref() {
            return name.clone();
        }
        if let Some(title) = self.title.borrow().as_ref().filter(|t| !t.trim().is_empty()) {
            return title.clone();
        }
        self.url().map(|u| address::pretty(&u)).unwrap_or_else(|| "New Tab".into())
    }

    pub fn monogram(&self) -> String {
        self.url()
            .and_then(|u| address::bare_host(&u))
            .and_then(|h| h.chars().next())
            .map(|c| c.to_uppercase().collect())
            .unwrap_or_else(|| "•".into())
    }

    pub fn view(&self) -> Option<webkit6::WebView> {
        self.web.borrow().clone()
    }
}
