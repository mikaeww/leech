use crate::design::{self, Curve};
use crate::history::{self, History, Kind, Suggestion};
use crate::omnibox::Omnibox;
use crate::prefs::Prefs;
use crate::stage::Stage;
use crate::tab::Tab;
use crate::tabbar::TabBar;
use crate::{address, engine, session, store};
use adw::prelude::*;
use gtk::glib::translate::IntoGlib;
use std::cell::{Cell, OnceCell, RefCell};
use std::rc::Rc;
use std::time::Duration;
use webkit6::prelude::*;

struct Ghost {
    url: String,
    title: Option<String>,
    index: usize,
}

pub struct Browser {
    pub window: adw::ApplicationWindow,
    pub prefs: Prefs,
    pub history: Rc<History>,
    network: webkit6::NetworkSession,
    pub tabs: RefCell<Vec<Rc<Tab>>>,
    pub active: Cell<Option<u64>>,
    next_id: Cell<u64>,
    ghosts: RefCell<Vec<Ghost>>,

    pub editing: Cell<bool>,
    summoning: Cell<bool>,
    typed: RefCell<String>,
    pub offers: RefCell<Vec<Suggestion>>,
    ending: RefCell<Option<String>>,
    pub picked: Cell<Option<usize>>,

    tabbar: OnceCell<Rc<TabBar>>,
    stage: OnceCell<Rc<Stage>>,
    omnibox: OnceCell<Rc<Omnibox>>,
    toast: gtk::Label,
    toast_timer: RefCell<Option<gtk::glib::SourceId>>,
    saving: Cell<bool>,
}

impl Browser {
    pub fn new(app: &adw::Application) -> Rc<Self> {
        let prefs = Prefs::load();
        design::apply_look(&prefs.string("look", "system"));
        let window = adw::ApplicationWindow::builder()
            .application(app)
            .title("Leech")
            .default_width(prefs.number("window.width", 1180.0) as i32)
            .default_height(prefs.number("window.height", 780.0) as i32)
            .maximized(prefs.bool("window.maximized", false))
            .width_request(640)
            .height_request(420)
            .build();
        window.add_css_class("leech");
        design::follow_dark(&window);

        let data = store::data_dir().join("webkit");
        let cache = store::cache_dir().join("webkit");
        let network = webkit6::NetworkSession::new(data.to_str(), cache.to_str());

        let toast = gtk::Label::new(None);
        toast.add_css_class("toast");
        toast.set_halign(gtk::Align::Center);
        toast.set_valign(gtk::Align::End);
        toast.set_margin_bottom(30);
        toast.set_visible(false);
        toast.set_can_target(false);

        let browser = Rc::new(Browser {
            window,
            prefs,
            history: History::load(),
            network,
            tabs: RefCell::new(vec![]),
            active: Cell::new(None),
            next_id: Cell::new(1),
            ghosts: RefCell::new(vec![]),
            editing: Cell::new(false),
            summoning: Cell::new(false),
            typed: RefCell::new(String::new()),
            offers: RefCell::new(vec![]),
            ending: RefCell::new(None),
            picked: Cell::new(None),
            tabbar: OnceCell::new(),
            stage: OnceCell::new(),
            omnibox: OnceCell::new(),
            toast,
            toast_timer: RefCell::new(None),
            saving: Cell::new(false),
        });

        let tabbar = TabBar::new(&browser);
        let stage = Stage::new(&browser);
        let omnibox = Omnibox::new(&browser);
        let column = gtk::Box::new(gtk::Orientation::Vertical, 0);
        column.append(&tabbar.root);
        column.append(&stage.root);
        let overlay = gtk::Overlay::new();
        overlay.set_child(Some(&column));
        overlay.add_overlay(&omnibox.root);
        overlay.add_overlay(&browser.toast);
        browser.window.set_content(Some(&overlay));
        let _ = browser.tabbar.set(tabbar);
        let _ = browser.stage.set(stage);
        let _ = browser.omnibox.set(omnibox);

        browser.install_keys();
        let b = Rc::downgrade(&browser);
        browser.window.connect_close_request(move |window| {
            if let Some(b) = b.upgrade() {
                b.prefs.set("window.maximized", window.is_maximized());
                if !window.is_maximized() {
                    b.prefs.set("window.width", window.width());
                    b.prefs.set("window.height", window.height());
                }
                b.flush();
            }
            gtk::glib::Propagation::Proceed
        });

        browser.restore();
        browser
    }

    // ---- lookups ----

    pub fn tab(&self, id: u64) -> Option<Rc<Tab>> {
        self.tabs.borrow().iter().find(|t| t.id == id).cloned()
    }

    pub fn active_tab(&self) -> Option<Rc<Tab>> {
        self.active.get().and_then(|id| self.tab(id))
    }

    fn index(&self, id: u64) -> Option<usize> {
        self.tabs.borrow().iter().position(|t| t.id == id)
    }

    pub fn page_left(&self) -> f64 {
        0.0
    }

    pub fn editing_or_blank(&self) -> bool {
        self.editing.get() || self.active_tab().is_none_or(|t| t.is_blank())
    }

    fn make_tab(&self) -> Rc<Tab> {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        Rc::new(Tab::new(id))
    }

    // ---- redraw ----

    /// Everything on screen follows the model; this brings it up to date.
    pub fn changed(self: &Rc<Self>) {
        let active = self.active_tab();
        if let Some(bar) = self.tabbar.get() {
            bar.refresh();
        }
        if let Some(stage) = self.stage.get() {
            stage.show(active.as_deref());
        }
        if let Some(omni) = self.omnibox.get() {
            omni.sync();
        }
        let title = active.map(|t| t.label()).unwrap_or_else(|| "Leech".into());
        self.window.set_title(Some(&title));
        self.save_later();
    }

    fn omni(&self) -> &Rc<Omnibox> {
        self.omnibox.get().expect("omnibox built")
    }

    pub fn toast(self: &Rc<Self>, text: &str) {
        self.toast.set_label(text);
        self.toast.set_visible(true);
        if let Some(old) = self.toast_timer.take() {
            old.remove();
        }
        let b = Rc::downgrade(self);
        let id = gtk::glib::timeout_add_local_once(Duration::from_millis(1700), move || {
            if let Some(b) = b.upgrade() {
                b.toast_timer.take();
                b.toast.set_visible(false);
            }
        });
        self.toast_timer.replace(Some(id));
    }

    // ---- web views ----

    fn web(self: &Rc<Self>, tab: &Rc<Tab>, related: Option<&webkit6::WebView>) -> webkit6::WebView {
        if let Some(web) = tab.view() {
            return web;
        }
        let settings = webkit6::Settings::new();
        settings.set_enable_developer_extras(true);
        settings.set_enable_back_forward_navigation_gestures(true);
        settings.set_enable_fullscreen(true);
        let builder = webkit6::WebView::builder().settings(&settings);
        let web = match related {
            Some(r) => builder.related_view(r).build(),
            None => builder.network_session(&self.network).build(),
        };
        web.set_background_color(&design::ground());
        let id = tab.id;

        let b = Rc::downgrade(self);
        web.connect_title_notify(move |web| {
            let Some(b) = b.upgrade() else { return };
            let Some(tab) = b.tab(id) else { return };
            let title = web.title().map(|t| t.to_string()).filter(|t| !t.is_empty());
            if let (Some(t), Some(url)) = (&title, tab.address.borrow().clone()) {
                b.history.retitle(&url, t);
            }
            tab.title.replace(title);
            b.changed();
        });
        let b = Rc::downgrade(self);
        web.connect_uri_notify(move |web| {
            let Some(b) = b.upgrade() else { return };
            let Some(tab) = b.tab(id) else { return };
            tab.can_back.set(web.can_go_back());
            tab.can_forward.set(web.can_go_forward());
            match web.uri().map(|u| u.to_string()) {
                Some(u) if u != "about:blank" && !u.is_empty() => {
                    tab.address.replace(Some(u));
                }
                _ => {}
            }
            b.changed();
        });
        let b = Rc::downgrade(self);
        web.connect_is_loading_notify(move |web| {
            let Some(b) = b.upgrade() else { return };
            let Some(tab) = b.tab(id) else { return };
            tab.loading.set(web.is_loading());
            tab.can_back.set(web.can_go_back());
            tab.can_forward.set(web.can_go_forward());
            b.changed();
        });
        let b = Rc::downgrade(self);
        web.connect_load_changed(move |web, event| {
            let Some(b) = b.upgrade() else { return };
            let Some(tab) = b.tab(id) else { return };
            match event {
                webkit6::LoadEvent::Committed => {
                    tab.failure.replace(None);
                    b.apply_zoom(&tab);
                    b.changed();
                }
                webkit6::LoadEvent::Finished => {
                    if let Some(url) = web.uri() {
                        let title = web.title().map(|t| t.to_string()).unwrap_or_default();
                        b.history.record(&url, &title);
                    }
                }
                _ => {}
            }
        });
        let b = Rc::downgrade(self);
        web.connect_load_failed(move |_, _, uri, error| {
            let Some(b) = b.upgrade() else { return false };
            let Some(tab) = b.tab(id) else { return false };
            let Some(message) = failure_message(error) else { return false };
            tab.address.replace(Some(uri.to_string()));
            tab.failure.replace(Some(message.into()));
            b.changed();
            true
        });
        let b = Rc::downgrade(self);
        web.connect_load_failed_with_tls_errors(move |_, uri, _, _| {
            let Some(b) = b.upgrade() else { return false };
            let Some(tab) = b.tab(id) else { return false };
            tab.address.replace(Some(uri.to_string()));
            tab.failure.replace(Some("The connection isn't secure.".into()));
            b.changed();
            true
        });
        let b = Rc::downgrade(self);
        web.connect_decide_policy(move |_, decision, kind| {
            let Some(b) = b.upgrade() else { return false };
            b.decide(id, decision, kind)
        });
        let b = Rc::downgrade(self);
        web.connect_create(move |web, _| {
            let b = b.upgrade()?;
            let tab = b.make_tab();
            tab.opener.set(Some(id));
            b.insert_after_active(tab.clone());
            let child = b.web(&tab, Some(web));
            b.select(tab.id);
            Some(child.upcast())
        });
        let b = Rc::downgrade(self);
        web.connect_close(move |_| {
            let Some(b) = b.upgrade() else { return };
            let opener = b.tab(id).and_then(|t| t.opener.get());
            if let Some(opener) = opener.filter(|o| b.tab(*o).is_some()) {
                b.select(opener);
            }
            b.close(id);
        });
        let b = Rc::downgrade(self);
        web.connect_web_process_terminated(move |web, _| {
            let Some(b) = b.upgrade() else { return };
            if b.active.get() == Some(id) {
                web.reload();
            }
        });
        tab.web.replace(Some(web.clone()));
        web
    }

    fn decide(self: &Rc<Self>, id: u64, decision: &webkit6::PolicyDecision, kind: webkit6::PolicyDecisionType) -> bool {
        use webkit6::PolicyDecisionType as T;
        match kind {
            T::NavigationAction | T::NewWindowAction => {
                let Some(nav) = decision.downcast_ref::<webkit6::NavigationPolicyDecision>() else { return false };
                let Some(action) = nav.navigation_action() else { return false };
                let Some(uri) = action.request().and_then(|r| r.uri()).map(|u| u.to_string()) else { return false };
                let ctrl = action.modifiers() & gtk::gdk::ModifierType::CONTROL_MASK.bits() != 0;
                let shift = action.modifiers() & gtk::gdk::ModifierType::SHIFT_MASK.bits() != 0;
                let scheme = uri.split(':').next().unwrap_or("").to_lowercase();
                if !["http", "https", "file", "about", "data", "blob"].contains(&scheme.as_str()) {
                    decision.ignore();
                    gtk::UriLauncher::new(&uri).launch(Some(&self.window), gtk::gio::Cancellable::NONE, |_| {});
                    return true;
                }
                let user = action.navigation_type() == webkit6::NavigationType::LinkClicked;
                if user && action.mouse_button() == 2 {
                    decision.ignore();
                    self.open(&uri, false);
                    return true;
                }
                if user && ctrl {
                    decision.ignore();
                    self.open(&uri, shift);
                    return true;
                }
                let _ = id;
                false
            }
            T::Response => {
                let Some(response) = decision.downcast_ref::<webkit6::ResponsePolicyDecision>() else { return false };
                let attachment = response
                    .response()
                    .and_then(|r| r.http_headers())
                    .and_then(|h| h.one("Content-Disposition"))
                    .is_some_and(|d| d.trim_start().to_lowercase().starts_with("attachment"));
                if attachment || !response.is_mime_type_supported() {
                    decision.download();
                    return true;
                }
                false
            }
            _ => false,
        }
    }

    fn apply_zoom(&self, tab: &Tab) {
        let (Some(web), Some(host)) = (tab.view(), tab.address.borrow().as_deref().and_then(address::bare_host)) else { return };
        web.set_zoom_level(self.prefs.number(&format!("zoom.{host}"), 1.0));
    }

    fn zoom(self: &Rc<Self>, factor: Option<f64>) {
        let Some(tab) = self.active_tab() else { return };
        let Some(web) = tab.view() else { return };
        let level = factor.map(|f| (web.zoom_level() * f).clamp(0.4, 3.0)).unwrap_or(1.0);
        web.set_zoom_level(level);
        if let Some(host) = tab.address.borrow().as_deref().and_then(address::bare_host) {
            self.prefs.set(&format!("zoom.{host}"), level);
        }
        self.toast(&format!("{}%", (level * 100.0).round()));
    }

    /// Builds the view of an asleep tab and loads what it was holding.
    fn wake(self: &Rc<Self>, tab: &Rc<Tab>) {
        let Some(url) = tab.pending.take() else { return };
        let web = self.web(tab, None);
        tab.address.replace(Some(url.clone()));
        web.load_uri(&url);
    }

    // ---- tabs ----

    fn insert_after_active(&self, tab: Rc<Tab>) {
        let at = self.active.get().and_then(|id| self.index(id)).map(|i| i + 1);
        let mut tabs = self.tabs.borrow_mut();
        let at = at.unwrap_or(tabs.len()).min(tabs.len());
        tabs.insert(at, tab);
    }

    pub fn select(self: &Rc<Self>, id: u64) {
        if let Some(old) = self.active_tab() {
            old.touched.set(store::now());
        }
        let Some(tab) = self.tab(id) else { return };
        tab.touched.set(store::now());
        self.active.set(Some(id));
        self.editing.set(false);
        self.summoning.set(false);
        self.wake(&tab);
        if let Some(bar) = self.tabbar.get() {
            bar.arm(Curve::Glide);
        }
        self.changed();
        self.focus_page();
    }

    fn focus_page(self: &Rc<Self>) {
        let b = Rc::downgrade(self);
        gtk::glib::idle_add_local_once(move || {
            let Some(b) = b.upgrade() else { return };
            match b.active_tab() {
                Some(t) if !t.is_blank() && !b.editing.get() => {
                    if let Some(web) = t.view() {
                        web.grab_focus();
                    }
                }
                _ => b.omni().focus(),
            }
        });
    }

    pub fn new_tab(self: &Rc<Self>) {
        let blank = self.tabs.borrow().iter().find(|t| t.is_blank()).cloned();
        let tab = match blank {
            // Never two blank tabs: the one there is moves to the end.
            Some(tab) => {
                self.tabs.borrow_mut().retain(|t| t.id != tab.id);
                tab
            }
            None => self.make_tab(),
        };
        self.tabs.borrow_mut().push(tab.clone());
        self.set_typed_quietly("");
        self.select(tab.id);
    }

    pub fn open(self: &Rc<Self>, url: &str, foreground: bool) {
        let tab = self.make_tab();
        tab.pending.replace(Some(url.to_string()));
        tab.opener.set(self.active.get());
        self.insert_after_active(tab.clone());
        if foreground {
            self.select(tab.id);
        } else {
            self.wake(&tab);
            if let Some(bar) = self.tabbar.get() {
                bar.arm(Curve::Settle);
            }
            self.changed();
        }
    }

    /// A link from another app: the blank tab takes it if there is one.
    pub fn arrive(self: &Rc<Self>, url: &str) {
        match self.active_tab() {
            Some(tab) if tab.is_blank() && self.typed.borrow().is_empty() => self.go(&tab, url),
            _ => {
                let tab = self.make_tab();
                tab.pending.replace(Some(url.to_string()));
                self.tabs.borrow_mut().push(tab.clone());
                self.select(tab.id);
            }
        }
        self.window.present();
    }

    fn go(self: &Rc<Self>, tab: &Rc<Tab>, url: &str) {
        tab.failure.replace(None);
        match tab.view() {
            Some(web) => {
                tab.address.replace(Some(url.to_string()));
                web.load_uri(url);
            }
            None => {
                tab.pending.replace(Some(url.to_string()));
                self.wake(tab);
            }
        }
        self.editing.set(false);
        self.changed();
        self.focus_page();
    }

    pub fn close(self: &Rc<Self>, id: u64) {
        let Some(index) = self.index(id) else { return };
        let Some(tab) = self.tab(id) else { return };
        let count = self.tabs.borrow().len();
        if count == 1 {
            if tab.is_blank() {
                self.window.close();
                return;
            }
            self.remember(&tab, index);
            let fresh = self.make_tab();
            self.tabs.borrow_mut().push(fresh.clone());
            self.drop_tab(&tab);
            self.select(fresh.id);
            return;
        }
        self.remember(&tab, index);
        let was_active = self.active.get() == Some(id);
        self.drop_tab(&tab);
        if was_active {
            let tabs = self.tabs.borrow();
            let next = tabs.get(index).or_else(|| tabs.last()).map(|t| t.id);
            drop(tabs);
            if let Some(next) = next {
                self.select(next);
            }
        } else {
            if let Some(bar) = self.tabbar.get() {
                bar.arm(Curve::Settle);
            }
            self.changed();
        }
    }

    fn drop_tab(&self, tab: &Rc<Tab>) {
        self.tabs.borrow_mut().retain(|t| t.id != tab.id);
        if let Some(stage) = self.stage.get() {
            stage.forget(tab);
        }
        if let Some(web) = tab.web.take() {
            web.try_close();
        }
    }

    fn remember(&self, tab: &Tab, index: usize) {
        let Some(url) = tab.url().filter(|u| address::is_web(u)) else { return };
        let mut ghosts = self.ghosts.borrow_mut();
        ghosts.push(Ghost { url, title: tab.title.borrow().clone(), index });
        if ghosts.len() > 12 {
            ghosts.remove(0);
        }
    }

    pub fn reopen(self: &Rc<Self>) {
        let Some(ghost) = self.ghosts.borrow_mut().pop() else { return };
        let tab = self.make_tab();
        tab.pending.replace(Some(ghost.url));
        tab.title.replace(ghost.title);
        {
            let mut tabs = self.tabs.borrow_mut();
            let at = ghost.index.min(tabs.len());
            tabs.insert(at, tab.clone());
        }
        self.select(tab.id);
    }

    fn duplicate(self: &Rc<Self>) {
        if let Some(url) = self.active_tab().and_then(|t| t.url()) {
            self.open(&url, true);
        }
    }

    fn step(self: &Rc<Self>, by: isize) {
        let tabs = self.tabs.borrow();
        let n = tabs.len() as isize;
        let Some(i) = self.active.get().and_then(|id| tabs.iter().position(|t| t.id == id)) else { return };
        let next = tabs[((i as isize + by).rem_euclid(n)) as usize].id;
        drop(tabs);
        self.select(next);
    }

    fn jump(self: &Rc<Self>, n: usize) {
        let tabs = self.tabs.borrow();
        let target = if n == 9 { tabs.last() } else { tabs.get(n - 1) }.map(|t| t.id);
        drop(tabs);
        if let Some(id) = target {
            self.select(id);
        }
    }

    pub fn back(self: &Rc<Self>) {
        if let Some(web) = self.active_tab().and_then(|t| t.view()) {
            web.go_back();
        }
    }

    pub fn forward(self: &Rc<Self>) {
        if let Some(web) = self.active_tab().and_then(|t| t.view()) {
            web.go_forward();
        }
    }

    pub fn reload_or_stop(self: &Rc<Self>) {
        let Some(tab) = self.active_tab() else { return };
        if tab.failure.borrow().is_some() {
            if let Some(url) = tab.address.borrow().clone() {
                self.go(&tab, &url);
            }
            return;
        }
        let Some(web) = tab.view() else { return };
        if web.is_loading() { web.stop_loading() } else { web.reload() }
    }

    // ---- the omnibox ----

    /// Ctrl+L: the current address comes up selected.
    pub fn edit(self: &Rc<Self>) {
        self.summoning.set(false);
        let url = self.active_tab().and_then(|t| t.url()).unwrap_or_default();
        self.typed.replace(url.clone());
        self.offers.borrow_mut().clear();
        self.ending.replace(None);
        self.picked.set(None);
        self.editing.set(true);
        self.omni().write(&url, None, true);
        self.changed();
    }

    /// Ctrl+K: only what is open.
    fn summon(self: &Rc<Self>) {
        self.summoning.set(true);
        self.editing.set(true);
        self.set_typed_quietly("");
        self.guess();
        self.changed();
    }

    fn set_typed_quietly(&self, text: &str) {
        self.typed.replace(text.to_string());
        self.ending.replace(None);
        if let Some(omni) = self.omnibox.get() {
            omni.write(text, None, false);
        }
    }

    pub fn dismiss(self: &Rc<Self>) {
        self.summoning.set(false);
        // A blank tab has nothing behind the field to go back to.
        if self.active_tab().is_none_or(|t| t.is_blank()) {
            return;
        }
        self.editing.set(false);
        self.typed.replace(String::new());
        self.offers.borrow_mut().clear();
        self.changed();
        self.focus_page();
    }

    pub fn escape(self: &Rc<Self>) {
        if self.picked.get().is_some() {
            self.picked.set(None);
            self.changed();
        } else {
            self.dismiss();
        }
    }

    pub fn set_typed(self: &Rc<Self>, text: &str, shortened: bool) {
        self.typed.replace(text.to_string());
        self.guess();
        if shortened {
            self.ending.replace(None);
        }
        let ending = self.ending.borrow().clone();
        self.omni().write(text, ending.as_deref(), false);
        self.changed();
    }

    fn search_url(&self, text: &str) -> Option<String> {
        let (e, custom) = self.prefs.engine();
        engine::url(text, &engine::template(&e, &custom))
    }

    fn guess(&self) {
        let typed = self.typed.borrow().clone();
        if self.summoning.get() {
            let offers = self.open_pages(&typed);
            self.picked.set((!offers.is_empty()).then_some(0));
            self.offers.replace(offers);
            self.ending.replace(None);
            return;
        }
        if typed.trim().is_empty() {
            self.offers.borrow_mut().clear();
            self.ending.replace(None);
            self.picked.set(None);
            return;
        }
        let mut list = self.history.suggestions(&typed, 3);
        if address::url(&typed).is_none() {
            if let Some(url) = self.search_url(&typed) {
                let (e, custom) = self.prefs.engine();
                list.push(Suggestion { key: typed.clone(), title: engine::name(&e, &custom), url, kind: Kind::Search, tab: None });
            }
        }
        self.ending.replace(history::completion(&typed, &list));
        self.offers.replace(list);
        self.picked.set(None);
    }

    fn open_pages(&self, typed: &str) -> Vec<Suggestion> {
        let needle = typed.trim().to_lowercase();
        let mut tabs: Vec<Rc<Tab>> = self
            .tabs
            .borrow()
            .iter()
            .filter(|t| Some(t.id) != self.active.get() && !t.is_blank())
            .filter(|t| {
                needle.is_empty()
                    || t.label().to_lowercase().contains(&needle)
                    || t.url().map(|u| address::pretty(&u)).unwrap_or_default().contains(&needle)
            })
            .cloned()
            .collect();
        tabs.sort_by(|a, b| b.touched.get().total_cmp(&a.touched.get()));
        tabs.truncate(if needle.is_empty() { 6 } else { 3 });
        tabs.iter()
            .filter_map(|t| {
                let url = t.url()?;
                Some(Suggestion { key: t.label(), title: address::pretty(&url), url, kind: Kind::Open, tab: Some(t.id) })
            })
            .collect()
    }

    pub fn has_ending(&self) -> bool {
        self.ending.borrow().as_ref().is_some_and(|e| !e.is_empty())
    }

    pub fn accept_ending(self: &Rc<Self>) {
        let Some(ending) = self.ending.take() else { return };
        let text = format!("{}{ending}", self.typed.borrow());
        self.typed.replace(text.clone());
        self.guess();
        self.ending.replace(None);
        self.omni().write(&text, None, false);
        self.changed();
    }

    pub fn walk(self: &Rc<Self>, step: isize) {
        let n = self.offers.borrow().len();
        if n == 0 {
            return;
        }
        let next = match self.picked.get() {
            None => Some(if step > 0 { 0 } else { n - 1 }),
            Some(here) => {
                let next = here as isize + step;
                (next >= 0 && (next as usize) < n).then_some(next as usize)
            }
        };
        self.picked.set(next);
        self.changed();
    }

    pub fn take(self: &Rc<Self>, index: usize) {
        let Some(offer) = self.offers.borrow().get(index).cloned() else { return };
        self.finish_with(offer);
    }

    fn finish_with(self: &Rc<Self>, offer: Suggestion) {
        self.summoning.set(false);
        self.typed.replace(String::new());
        self.picked.set(None);
        self.offers.borrow_mut().clear();
        if let Some(id) = offer.tab.filter(|id| self.tab(*id).is_some()) {
            self.select(id);
        } else if let Some(tab) = self.active_tab() {
            self.go(&tab, &offer.url);
        }
    }

    /// Return: a picked row wins, then what the field was finishing, then what was typed.
    pub fn submit(self: &Rc<Self>) {
        if let Some(offer) = self.picked.get().and_then(|i| self.offers.borrow().get(i).cloned()) {
            self.finish_with(offer);
            return;
        }
        let typed = self.typed.borrow().clone();
        if self.summoning.replace(false) && typed.trim().is_empty() {
            self.dismiss();
            return;
        }
        let target = match self.ending.borrow().as_ref() {
            Some(ending) => address::url(&format!("{typed}{ending}")),
            None => address::url(&typed).or_else(|| self.search_url(&typed)),
        };
        let Some(url) = target else {
            self.omni().refuse();
            return;
        };
        self.typed.replace(String::new());
        self.offers.borrow_mut().clear();
        self.ending.replace(None);
        if let Some(tab) = self.active_tab() {
            self.go(&tab, &url);
        }
    }

    // ---- keys ----

    fn install_keys(self: &Rc<Self>) {
        let keys = gtk::EventControllerKey::new();
        keys.set_propagation_phase(gtk::PropagationPhase::Capture);
        let b = Rc::downgrade(self);
        keys.connect_key_pressed(move |_, key, _, mods| {
            let handled = b.upgrade().is_some_and(|b| b.shortcut(key, mods));
            if handled { gtk::glib::Propagation::Stop } else { gtk::glib::Propagation::Proceed }
        });
        self.window.add_controller(keys);

        let buttons = gtk::GestureClick::new();
        buttons.set_button(0);
        buttons.set_propagation_phase(gtk::PropagationPhase::Capture);
        let b = Rc::downgrade(self);
        buttons.connect_pressed(move |gesture, _, _, _| {
            let Some(b) = b.upgrade() else { return };
            match gesture.current_button() {
                8 => b.back(),
                9 => b.forward(),
                _ => return,
            }
            gesture.set_state(gtk::EventSequenceState::Claimed);
        });
        self.window.add_controller(buttons);
    }

    fn shortcut(self: &Rc<Self>, key: gtk::gdk::Key, mods: gtk::gdk::ModifierType) -> bool {
        use gtk::gdk::{Key, ModifierType as M};
        let mods = mods & (M::CONTROL_MASK | M::SHIFT_MASK | M::ALT_MASK);
        let ctrl = M::CONTROL_MASK;
        let shift = M::SHIFT_MASK;
        let key = key.to_lower();
        match (mods, key) {
            (m, Key::t) if m == ctrl => self.new_tab(),
            (m, Key::t) if m == ctrl | shift => self.reopen(),
            (m, Key::w) if m == ctrl => {
                if let Some(id) = self.active.get() {
                    self.close(id);
                }
            }
            (m, Key::l) if m == ctrl => self.edit(),
            (m, Key::k) if m == ctrl => self.summon(),
            (m, Key::r) if m == ctrl => self.reload_or_stop(),
            (m, Key::F5) if m.is_empty() => self.reload_or_stop(),
            (m, Key::bracketleft) if m == ctrl => self.back(),
            (m, Key::bracketright) if m == ctrl => self.forward(),
            (m, Key::Left) if m == M::ALT_MASK => self.back(),
            (m, Key::Right) if m == M::ALT_MASK => self.forward(),
            (m, Key::Tab) if m == ctrl => self.step(1),
            (m, Key::ISO_Left_Tab | Key::Tab) if m == ctrl | shift => self.step(-1),
            (m, Key::Page_Down) if m == ctrl => self.step(1),
            (m, Key::Page_Up) if m == ctrl => self.step(-1),
            (m, Key::braceright | Key::bracketright) if m == ctrl | shift => self.step(1),
            (m, Key::braceleft | Key::bracketleft) if m == ctrl | shift => self.step(-1),
            (m, Key::d) if m == ctrl => self.duplicate(),
            (m, Key::c) if m == ctrl | M::ALT_MASK => self.copy_address(),
            (m, Key::plus | Key::equal | Key::KP_Add) if m == ctrl || m == ctrl | shift => self.zoom(Some(1.1)),
            (m, Key::minus | Key::KP_Subtract) if m == ctrl => self.zoom(Some(1.0 / 1.1)),
            (m, Key::_0 | Key::KP_0) if m == ctrl => self.zoom(None),
            (m, Key::i) if m == ctrl | shift => self.inspect(),
            (m, Key::q) if m == ctrl => self.window.close(),
            (m, k) if m == ctrl && (Key::_1..=Key::_9).contains(&k) => {
                self.jump((k.into_glib() - Key::_0.into_glib()) as usize)
            }
            (m, Key::Escape) if m.is_empty() => {
                if self.editing.get() {
                    self.escape();
                } else if let Some(web) = self.active_tab().and_then(|t| t.view()).filter(|w| w.is_loading()) {
                    web.stop_loading();
                } else {
                    return false;
                }
            }
            _ => return false,
        }
        true
    }

    fn copy_address(self: &Rc<Self>) {
        if let Some(url) = self.active_tab().and_then(|t| t.address.borrow().clone()) {
            self.window.clipboard().set_text(&url);
            self.toast("Address copied");
        }
    }

    fn inspect(&self) {
        if let Some(inspector) = self.active_tab().and_then(|t| t.view()).and_then(|w| w.inspector()) {
            inspector.show();
        }
    }

    // ---- session ----

    fn restore(self: &Rc<Self>) {
        let saved = session::read();
        for entry in &saved.tabs {
            let tab = self.make_tab();
            tab.pending.replace(Some(entry.url.clone()));
            tab.title.replace(entry.title.clone().filter(|t| !t.is_empty()));
            tab.pin.replace(entry.pin.clone());
            tab.name.replace(entry.name.clone());
            self.tabs.borrow_mut().push(tab);
        }
        if self.tabs.borrow().is_empty() {
            let tab = self.make_tab();
            self.tabs.borrow_mut().push(tab);
        }
        let n = self.tabs.borrow().len();
        let active = self.tabs.borrow()[saved.active.min(n - 1)].id;
        self.select(active);
    }

    fn snapshot(&self) -> session::Saved {
        let tabs = self.tabs.borrow();
        let mut out = session::Saved::default();
        for tab in tabs.iter() {
            let Some(url) = tab.url().filter(|u| address::is_web(u)) else { continue };
            if Some(tab.id) == self.active.get() {
                out.active = out.tabs.len();
            }
            out.tabs.push(session::SavedTab {
                url,
                title: tab.title.borrow().clone(),
                pin: tab.pin.borrow().clone(),
                name: tab.name.borrow().clone(),
            });
        }
        out
    }

    fn save_later(self: &Rc<Self>) {
        if self.saving.replace(true) {
            return;
        }
        let b = Rc::downgrade(self);
        gtk::glib::timeout_add_local_once(Duration::from_millis(1200), move || {
            if let Some(b) = b.upgrade() {
                b.saving.set(false);
                session::write(&b.snapshot());
            }
        });
    }

    pub fn flush(&self) {
        session::write(&self.snapshot());
        self.history.flush();
    }
}

fn failure_message(error: &gtk::glib::Error) -> Option<&'static str> {
    use gtk::gio::{IOErrorEnum, ResolverError};
    if error.matches(webkit6::NetworkError::Cancelled)
        || error.matches(webkit6::PolicyError::FrameLoadInterruptedByPolicyChange)
        || error.matches(webkit6::PolicyError::CannotShowMimeType)
        || error.matches(IOErrorEnum::Cancelled)
    {
        return None;
    }
    Some(if error.matches(ResolverError::NotFound) || error.matches(ResolverError::TemporaryFailure) {
        "No site at that address."
    } else if error.matches(IOErrorEnum::NetworkUnreachable) || error.matches(IOErrorEnum::HostUnreachable) {
        "No connection."
    } else if error.matches(IOErrorEnum::TimedOut) {
        "The site took too long to answer."
    } else if error.matches(IOErrorEnum::ConnectionRefused) {
        "The site refused the connection."
    } else if error.domain() == gtk::gio::TlsError::domain() {
        "The connection isn't secure."
    } else {
        "The page didn't load."
    })
}
