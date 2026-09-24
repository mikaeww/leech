use crate::browser::Browser;
use crate::design::{self, Curve};
use crate::history::Kind;
use adw::prelude::*;
use std::cell::{Cell, RefCell};
use std::rc::{Rc, Weak};

const FIELD_WIDTH: f64 = 560.0;

pub struct Omnibox {
    pub root: gtk::Fixed,
    scrim: gtk::Box,
    field: gtk::Box,
    text: gtk::Text,
    list: gtk::Box,
    /// 0 hidden … 1 shown; scales the card from 0.97 and fades it.
    appear: Rc<Cell<f64>>,
    shake: Rc<Cell<f64>>,
    shown: Cell<bool>,
    animation: RefCell<Option<adw::Animation>>,
    shaking: RefCell<Option<adw::Animation>>,
    /// Set while the field's text is written from code, so `changed` doesn't read it back.
    quiet: Cell<bool>,
    /// A deletion means the ending wasn't wanted; don't put it straight back.
    shortened: Cell<bool>,
    browser: Weak<Browser>,
}

impl Omnibox {
    pub fn new(browser: &Rc<Browser>) -> Rc<Self> {
        let root = gtk::Fixed::new();
        root.set_visible(false);
        let scrim = gtk::Box::new(gtk::Orientation::Vertical, 0);
        scrim.add_css_class("scrim");
        let text = gtk::Text::new();
        text.set_placeholder_text(Some("Enter a web address"));
        text.set_hexpand(true);
        text.set_input_hints(gtk::InputHints::NO_SPELLCHECK | gtk::InputHints::LOWERCASE);
        let field = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        field.add_css_class("omni-field");
        field.append(&text);
        let list = gtk::Box::new(gtk::Orientation::Vertical, 0);
        list.add_css_class("omni-list");
        list.set_visible(false);
        for w in [scrim.upcast_ref::<gtk::Widget>(), field.upcast_ref(), list.upcast_ref()] {
            w.set_parent(&root);
        }

        let omni = Rc::new_cyclic(|me: &Weak<Omnibox>| {
            let me = me.clone();
            root.set_layout_manager(Some(crate::layout::manual(0, move |_, w, h| {
                if let Some(me) = me.upgrade() {
                    me.allocate(w as f64, h as f64);
                }
            })));
            Omnibox {
                root,
                scrim,
                field,
                text,
                list,
                appear: Rc::new(Cell::new(0.0)),
                shake: Rc::new(Cell::new(1.0)),
                shown: Cell::new(false),
                animation: RefCell::new(None),
                shaking: RefCell::new(None),
                quiet: Cell::new(false),
                shortened: Cell::new(false),
                browser: Rc::downgrade(browser),
            }
        });

        let click = gtk::GestureClick::new();
        let b = Rc::downgrade(browser);
        click.connect_released(move |_, _, _, _| if let Some(b) = b.upgrade() { b.dismiss() });
        omni.scrim.add_controller(click);

        let me = Rc::downgrade(&omni);
        omni.text.connect_changed(move |text| {
            let Some(me) = me.upgrade() else { return };
            if me.quiet.get() {
                return;
            }
            let Some(b) = me.browser.upgrade() else { return };
            me.field.remove_css_class("refused");
            b.set_typed(&text.text(), me.shortened.take());
        });

        let keys = gtk::EventControllerKey::new();
        keys.set_propagation_phase(gtk::PropagationPhase::Capture);
        let me = Rc::downgrade(&omni);
        keys.connect_key_pressed(move |_, key, _, mods| {
            use gtk::gdk::Key;
            let Some(me) = me.upgrade() else { return gtk::glib::Propagation::Proceed };
            let Some(b) = me.browser.upgrade() else { return gtk::glib::Propagation::Proceed };
            let at_end = me.text.position() >= me.text.text().chars().count() as i32 || me.text.selection_bounds().is_some();
            match key {
                Key::Return | Key::KP_Enter => b.submit(),
                Key::Up => b.walk(-1),
                Key::Down => b.walk(1),
                Key::Tab if mods.is_empty() => b.accept_ending(),
                Key::Right if at_end && b.has_ending() => b.accept_ending(),
                Key::Escape => b.escape(),
                Key::BackSpace | Key::Delete => {
                    me.shortened.set(true);
                    return gtk::glib::Propagation::Proceed;
                }
                _ => return gtk::glib::Propagation::Proceed,
            }
            gtk::glib::Propagation::Stop
        });
        omni.text.add_controller(keys);
        omni
    }

    /// Writes typed + ending, with the ending selected so typing on replaces it.
    /// Deferred: inside `changed`, GtkText would move the cursor after us and drop the selection.
    pub fn write(self: &Rc<Self>, typed: &str, ending: Option<&str>, select_all: bool) {
        let (me, typed, ending) = (Rc::downgrade(self), typed.to_string(), ending.map(str::to_string));
        gtk::glib::idle_add_local_once(move || {
            if let Some(me) = me.upgrade() {
                me.write_now(&typed, ending.as_deref(), select_all);
            }
        });
    }

    fn write_now(&self, typed: &str, ending: Option<&str>, select_all: bool) {
        self.quiet.set(true);
        let full = format!("{typed}{}", ending.unwrap_or(""));
        if self.text.text() != full {
            self.text.set_text(&full);
        }
        let typed_len = typed.chars().count() as i32;
        if select_all {
            self.text.select_region(0, -1);
        } else if ending.is_some() {
            self.text.select_region(typed_len, -1);
        } else {
            self.text.set_position(-1);
        }
        self.quiet.set(false);
    }

    pub fn sync(self: &Rc<Self>) {
        let Some(b) = self.browser.upgrade() else { return };
        let blank = b.active_tab().is_none_or(|t| t.is_blank());
        let show = b.editing.get() || blank;
        self.scrim.set_visible(!blank);
        self.fill_list(&b);
        if show != self.shown.get() {
            self.shown.set(show);
            if show {
                self.root.set_visible(true);
            }
            let (from, curve) = (self.appear.get(), if show { Curve::Settle } else { Curve::Quick });
            let appear = self.appear.clone();
            let root = self.root.downgrade();
            let animation = design::animate(&self.root, from, if show { 1.0 } else { 0.0 }, curve, move |v| {
                appear.set(v);
                if let Some(root) = root.upgrade() {
                    root.queue_allocate();
                }
            });
            let root = self.root.downgrade();
            let me = Rc::downgrade(self);
            animation.connect_done(move |_| {
                if let (Some(root), Some(me)) = (root.upgrade(), me.upgrade()) {
                    if !me.shown.get() {
                        root.set_visible(false);
                    }
                }
            });
            self.animation.replace(Some(animation));
        }
        if show {
            self.text.grab_focus_without_selecting();
        }
        self.root.queue_allocate();
    }

    pub fn focus(&self) {
        self.text.grab_focus_without_selecting();
    }

    pub fn refuse(&self) {
        self.field.add_css_class("refused");
        let shake = self.shake.clone();
        let root = self.root.downgrade();
        let target = adw::CallbackAnimationTarget::new(move |v| {
            shake.set(v);
            if let Some(root) = root.upgrade() {
                root.queue_allocate();
            }
        });
        let a = adw::TimedAnimation::new(&self.root, 0.0, 1.0, 500, target);
        a.set_easing(adw::Easing::EaseOutQuad);
        a.play();
        self.shaking.replace(Some(a.upcast()));
    }

    fn fill_list(&self, b: &Rc<Browser>) {
        while let Some(child) = self.list.first_child() {
            self.list.remove(&child);
        }
        let offers = b.offers.borrow();
        self.list.set_visible(!offers.is_empty() && b.editing_or_blank());
        for (index, offer) in offers.iter().enumerate() {
            let row = gtk::Box::new(gtk::Orientation::Horizontal, 10);
            row.add_css_class("offer");
            if b.picked.get() == Some(index) {
                row.add_css_class("picked");
            }
            match offer.kind {
                Kind::Search => {
                    let glass = gtk::Image::from_icon_name("system-search-symbolic");
                    glass.set_pixel_size(10);
                    glass.add_css_class("glass");
                    row.append(&glass);
                }
                Kind::Open => {
                    let dot = gtk::Box::new(gtk::Orientation::Horizontal, 0);
                    dot.add_css_class("dot");
                    dot.set_valign(gtk::Align::Center);
                    row.append(&dot);
                }
                _ => {}
            }
            let key = gtk::Label::new(Some(&offer.key));
            key.add_css_class("key");
            key.set_ellipsize(gtk::pango::EllipsizeMode::End);
            row.append(&key);
            if !offer.title.is_empty() {
                let title = gtk::Label::new(Some(&offer.title));
                title.add_css_class("title");
                title.set_ellipsize(gtk::pango::EllipsizeMode::End);
                title.set_xalign(0.0);
                title.set_hexpand(true);
                row.append(&title);
            }
            let click = gtk::GestureClick::new();
            let bw = Rc::downgrade(b);
            click.connect_released(move |_, _, _, _| if let Some(b) = bw.upgrade() { b.take(index) });
            row.add_controller(click);
            self.list.append(&row);
        }
    }

    fn allocate(&self, w: f64, h: f64) {
        let a = self.appear.get();
        let left = self.browser.upgrade().map(|b| b.page_left()).unwrap_or(0.0);
        self.scrim.set_opacity(a.clamp(0.0, 1.0));
        self.scrim.size_allocate(&gtk::Allocation::new(0, 0, w as i32, h as i32), -1);

        let t = self.shake.get();
        let dx = (t * 6.0 * std::f64::consts::PI).sin() * 7.0 * (1.0 - t);
        let fw = FIELD_WIDTH.min(w - left - 32.0).max(200.0);
        let fh = self.field.measure(gtk::Orientation::Vertical, fw as i32).1 as f64;
        let x = left + (w - left - fw) / 2.0 + dx;
        // Lifted 60 above centre: dead centre reads as low.
        let y = ((h - 60.0) / 2.0 - fh / 2.0).round();
        let scale = 0.97 + 0.03 * a;
        let place = |widget: &gtk::Widget, x: f64, y: f64, ww: f64, hh: f64| {
            let t = gtk::gsk::Transform::new()
                .translate(&gtk::graphene::Point::new((x + ww / 2.0) as f32, (y + hh / 2.0) as f32))
                .scale(scale as f32, scale as f32)
                .translate(&gtk::graphene::Point::new((-ww / 2.0) as f32, (-hh / 2.0) as f32));
            widget.set_opacity(a.clamp(0.0, 1.0));
            widget.allocate(ww as i32, hh as i32, -1, Some(t));
        };
        place(self.field.upcast_ref(), x, y, fw, fh);
        if self.list.is_visible() {
            let lh = self.list.measure(gtk::Orientation::Vertical, fw as i32).1 as f64;
            place(self.list.upcast_ref(), x, y + fh + 8.0, fw, lh);
        }
    }
}
