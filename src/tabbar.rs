use crate::browser::Browser;
use crate::design::{self, Curve};
use crate::tab::Tab;
use adw::prelude::*;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::{Rc, Weak};

pub const STRIP: i32 = 52;
const TAB_WIDTH: f64 = 186.0;
const TAB_MIN: f64 = 36.0;
const TAB_TITLED: f64 = 80.0;
const TAB_GAP: f64 = 2.0;
const PIN_WIDTH: f64 = 30.0;
const PLUS_WIDTH: f64 = 30.0;
const PILL_HEIGHT: f64 = 28.0;

const PILL: i64 = -1;
const PLUS: i64 = -2;

struct Item {
    id: u64,
    root: gtk::Box,
    mark: gtk::Label,
    title: gtk::Label,
    ring: Ring,
}

pub struct TabBar {
    pub root: gtk::WindowHandle,
    run: gtk::Fixed,
    pill: gtk::Box,
    plus: gtk::Button,
    back: gtk::Button,
    forward: gtk::Button,
    reload: gtk::Button,
    items: RefCell<Vec<Item>>,
    /// Where each child was last drawn, and where the running animation started.
    shown: RefCell<HashMap<i64, (f64, f64)>>,
    from: RefCell<HashMap<i64, (f64, f64)>>,
    progress: Rc<Cell<f64>>,
    armed: Cell<Option<Curve>>,
    animation: RefCell<Option<adw::Animation>>,
    browser: Weak<Browser>,
}

fn door(icon: &str, tip: &str) -> gtk::Button {
    let b = gtk::Button::from_icon_name(icon);
    b.add_css_class("door");
    b.set_tooltip_text(Some(tip));
    b.set_valign(gtk::Align::Center);
    b.set_focusable(false);
    b
}

impl TabBar {
    pub fn new(browser: &Rc<Browser>) -> Rc<Self> {
        let run = gtk::Fixed::new();
        run.set_hexpand(true);
        run.set_overflow(gtk::Overflow::Hidden);
        let pill = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        pill.add_css_class("pill");
        pill.set_parent(&run);
        let plus = gtk::Button::from_icon_name("list-add-symbolic");
        plus.add_css_class("plus");
        plus.set_tooltip_text(Some("New Tab  Ctrl+T"));
        plus.set_focusable(false);
        plus.set_parent(&run);

        let back = door("go-previous-symbolic", "Back  Ctrl+[");
        let forward = door("go-next-symbolic", "Forward  Ctrl+]");
        let reload = door("view-refresh-symbolic", "Reload  Ctrl+R");
        let helm = gtk::Box::new(gtk::Orientation::Horizontal, 2);
        helm.set_margin_end(8);
        for b in [&back, &forward, &reload] {
            helm.append(b);
        }
        let controls = gtk::WindowControls::new(gtk::PackType::End);
        controls.set_valign(gtk::Align::Center);

        let row = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        row.add_css_class("strip");
        row.set_margin_start(12);
        row.set_margin_end(12);
        row.append(&run);
        row.append(&helm);
        row.append(&controls);
        let root = gtk::WindowHandle::new();
        root.set_child(Some(&row));
        root.set_size_request(-1, STRIP);

        let bar = Rc::new_cyclic(|me: &Weak<TabBar>| {
            let me = me.clone();
            let layout = crate::layout::manual(STRIP, move |_, w, h| {
                if let Some(bar) = me.upgrade() {
                    bar.allocate(w as f64, h as f64);
                }
            });
            run.set_layout_manager(Some(layout));
            TabBar {
                root,
                run,
                pill,
                plus,
                back,
                forward,
                reload,
                items: RefCell::new(vec![]),
                shown: RefCell::new(HashMap::new()),
                from: RefCell::new(HashMap::new()),
                progress: Rc::new(Cell::new(1.0)),
                armed: Cell::new(None),
                animation: RefCell::new(None),
                browser: Rc::downgrade(browser),
            }
        });

        let b = Rc::downgrade(browser);
        bar.plus.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.new_tab() });
        let b = Rc::downgrade(browser);
        bar.back.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.back() });
        let b = Rc::downgrade(browser);
        bar.forward.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.forward() });
        let b = Rc::downgrade(browser);
        bar.reload.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.reload_or_stop() });
        bar
    }

    /// The next layout pass moves children with this curve instead of jumping.
    pub fn arm(&self, curve: Curve) {
        self.armed.set(Some(curve));
    }

    pub fn refresh(&self) {
        let Some(browser) = self.browser.upgrade() else { return };
        let tabs = browser.tabs.borrow().clone();
        let active = browser.active.get();
        {
            let mut items = self.items.borrow_mut();
            items.retain(|item| {
                let keep = tabs.iter().any(|t| t.id == item.id);
                if !keep {
                    item.root.unparent();
                    self.shown.borrow_mut().remove(&(item.id as i64));
                }
                keep
            });
            for tab in &tabs {
                if !items.iter().any(|i| i.id == tab.id) {
                    let item = self.make_item(tab, &browser);
                    item.root.insert_before(&self.run, Some(&self.plus));
                    item.root.set_opacity(0.0);
                    let root = item.root.downgrade();
                    design::animate(&item.root, 0.0, 1.0, Curve::Settle, move |v| {
                        if let Some(root) = root.upgrade() {
                            root.set_opacity(v.clamp(0.0, 1.0));
                        }
                    });
                    items.push(item);
                }
            }
            items.sort_by_key(|i| tabs.iter().position(|t| t.id == i.id));
            for item in items.iter() {
                let tab = tabs.iter().find(|t| t.id == item.id).expect("item has a tab");
                let live = Some(tab.id) == active;
                let label = tab.label();
                item.title.set_label(&label);
                item.root.set_tooltip_text(Some(&label));
                item.mark.set_label(&tab.pin.borrow().clone().unwrap_or_else(|| tab.monogram()));
                if live { item.root.add_css_class("live") } else { item.root.remove_css_class("live") }
                item.ring.set_spinning(tab.loading.get());
                if tab.loading.get() { item.root.add_css_class("loading") } else { item.root.remove_css_class("loading") }
            }
        }
        let tab = browser.active_tab();
        let blank = tab.as_ref().is_none_or(|t| t.is_blank());
        self.back.set_sensitive(!blank && tab.as_ref().is_some_and(|t| t.can_back.get()));
        self.forward.set_sensitive(!blank && tab.as_ref().is_some_and(|t| t.can_forward.get()));
        self.reload.set_sensitive(!blank);
        let loading = tab.as_ref().is_some_and(|t| t.loading.get());
        self.reload.set_icon_name(if loading { "process-stop-symbolic" } else { "view-refresh-symbolic" });
        self.reload.set_tooltip_text(Some(if loading { "Stop  Esc" } else { "Reload  Ctrl+R" }));
        self.run.queue_allocate();
    }

    fn make_item(&self, tab: &Tab, browser: &Rc<Browser>) -> Item {
        let root = gtk::Box::new(gtk::Orientation::Horizontal, 0);
        root.add_css_class("tab");
        let mark = gtk::Label::new(None);
        mark.add_css_class("mark");
        let title = gtk::Label::new(None);
        title.set_ellipsize(gtk::pango::EllipsizeMode::End);
        title.set_xalign(0.0);
        let ring = Ring::new();
        let cross = gtk::Image::from_icon_name("window-close-symbolic");
        cross.set_pixel_size(8);
        let close = gtk::Button::new();
        close.set_child(Some(&cross));
        close.add_css_class("tab-close");
        close.set_focusable(false);
        close.set_tooltip_text(Some("Close Tab  Ctrl+W"));
        for child in [mark.upcast_ref::<gtk::Widget>(), title.upcast_ref(), ring.area.upcast_ref(), close.upcast_ref()] {
            child.set_parent(&root);
        }
        let parts = (mark.clone(), title.clone(), ring.area.clone(), close.clone());
        root.set_layout_manager(Some(crate::layout::manual(PILL_HEIGHT as i32, move |_, w, h| lay_out_tab(&parts, w, h))));

        let id = tab.id;
        let b = Rc::downgrade(browser);
        close.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.close(id) });
        let click = gtk::GestureClick::new();
        click.set_button(0);
        let b = Rc::downgrade(browser);
        click.connect_released(move |gesture, _, x, y| {
            let Some(b) = b.upgrade() else { return };
            let widget = gesture.widget().expect("gesture on a widget");
            let inside = x >= 0.0 && y >= 0.0 && x <= widget.width() as f64 && y <= widget.height() as f64;
            match gesture.current_button() {
                1 if b.active.get() == Some(id) => b.edit(),
                1 => b.select(id),
                2 if inside => b.close(id),
                _ => {}
            }
        });
        root.add_controller(click);
        Item { id, root, mark, title, ring }
    }

    fn targets(&self, width: f64, height: f64) -> HashMap<i64, (f64, f64)> {
        let browser = self.browser.upgrade();
        let tabs: Vec<(u64, bool)> = browser
            .as_ref()
            .map(|b| b.tabs.borrow().iter().map(|t| (t.id, t.pin.borrow().is_some())).collect())
            .unwrap_or_default();
        let active = browser.as_ref().and_then(|b| b.active.get());
        let count = tabs.len() as f64;
        let pinned = tabs.iter().filter(|t| t.1).count() as f64;
        let loose = count - pinned;
        let room = (width - TAB_GAP - PLUS_WIDTH).max(0.0);
        let each = if loose == 0.0 {
            TAB_WIDTH
        } else {
            ((room - pinned * PIN_WIDTH - (count - 1.0).max(0.0) * TAB_GAP) / loose).clamp(TAB_MIN, TAB_WIDTH)
        };
        let mut out = HashMap::new();
        let mut x = 0.0;
        for (id, pin) in &tabs {
            let w = if *pin { PIN_WIDTH } else { each };
            out.insert(*id as i64, (x, w));
            if Some(*id) == active {
                out.insert(PILL, (x, w));
            }
            x += w + TAB_GAP;
        }
        let _ = height;
        out.insert(PLUS, (x, PLUS_WIDTH));
        out
    }

    fn allocate(self: &Rc<Self>, width: f64, height: f64) {
        let targets = self.targets(width, height);
        if let Some(curve) = self.armed.take() {
            *self.from.borrow_mut() = self.shown.borrow().clone();
            self.progress.set(0.0);
            let progress = self.progress.clone();
            let run = self.run.downgrade();
            let animation = design::animate(&self.run, 0.0, 1.0, curve, move |v| {
                progress.set(v);
                if let Some(run) = run.upgrade() {
                    run.queue_allocate();
                }
            });
            self.animation.replace(Some(animation));
        }
        let p = self.progress.get();
        let settled = self.animation.borrow().as_ref().is_none_or(|a| a.state() == adw::AnimationState::Finished);
        let from = self.from.borrow();
        let place = |key: i64| -> Option<(f64, f64)> {
            let &(tx, tw) = targets.get(&key)?;
            match from.get(&key) {
                Some(&(fx, fw)) if !settled => Some((fx + (tx - fx) * p, fw + (tw - fw) * p)),
                _ => Some((tx, tw)),
            }
        };
        let mut shown = HashMap::new();
        let mut put = |widget: &gtk::Widget, key: i64, h: f64| {
            if let Some((x, w)) = place(key) {
                let ty = ((height - h) / 2.0).round();
                widget.set_child_visible(true);
                widget.size_allocate(&gtk::Allocation::new(x.round() as i32, ty as i32, w.round().max(0.0) as i32, h as i32), -1);
                shown.insert(key, (x, w));
            } else {
                widget.set_child_visible(false);
            }
        };
        put(self.pill.upcast_ref(), PILL, PILL_HEIGHT);
        for item in self.items.borrow().iter() {
            put(item.root.upcast_ref(), item.id as i64, PILL_HEIGHT);
        }
        let plus_h = self.plus.measure(gtk::Orientation::Vertical, -1).1 as f64;
        put(self.plus.upcast_ref(), PLUS, plus_h);
        drop(from);
        *self.shown.borrow_mut() = shown;
    }
}

/// A titled tab: [title …] [close or ring]. Below 80 px only the monogram, centred.
fn lay_out_tab(parts: &(gtk::Label, gtk::Label, gtk::DrawingArea, gtk::Button), w: i32, h: i32) {
    let (mark, title, ring, close) = parts;
    let slot = 15;
    let compact = (w as f64) < TAB_TITLED;
    let cy = (h - slot) / 2;
    mark.set_child_visible(compact);
    title.set_child_visible(!compact);
    ring.set_child_visible(!compact);
    close.set_child_visible(!compact);
    if compact {
        mark.size_allocate(&gtk::Allocation::new((w - slot) / 2, cy, slot, slot), -1);
        return;
    }
    let right = w - 7 - slot;
    title.size_allocate(&gtk::Allocation::new(11, 0, (right - 2 - 11).max(0), h), -1);
    ring.size_allocate(&gtk::Allocation::new(right, cy, slot, slot), -1);
    close.size_allocate(&gtk::Allocation::new(right, cy, slot, slot), -1);
}

/// The loading ring: an open arc turning once every 0.85 s.
#[derive(Clone)]
struct Ring {
    area: gtk::DrawingArea,
    tick: Rc<RefCell<Option<gtk::TickCallbackId>>>,
}

impl Ring {
    fn new() -> Self {
        let area = gtk::DrawingArea::new();
        area.add_css_class("ring");
        area.set_draw_func(|area, cr, w, h| {
            let Some(clock) = area.frame_clock() else { return };
            let turn = (clock.frame_time() as f64 / 1e6 / 0.85).fract() * std::f64::consts::TAU;
            let c = area.color();
            cr.set_source_rgba(c.red() as f64, c.green() as f64, c.blue() as f64, 0.7 * c.alpha() as f64);
            cr.set_line_width(1.4);
            cr.set_line_cap(gtk::cairo::LineCap::Round);
            let start = turn - std::f64::consts::FRAC_PI_2;
            cr.arc(w as f64 / 2.0, h as f64 / 2.0, 4.3, start, start + 0.78 * std::f64::consts::TAU);
            let _ = cr.stroke();
        });
        area.set_visible(false);
        Ring { area, tick: Rc::new(RefCell::new(None)) }
    }

    fn set_spinning(&self, on: bool) {
        if on == self.tick.borrow().is_some() {
            return;
        }
        self.area.set_visible(on);
        if on {
            let id = self.area.add_tick_callback(|area, _| {
                area.queue_draw();
                gtk::glib::ControlFlow::Continue
            });
            self.tick.replace(Some(id));
        } else if let Some(id) = self.tick.take() {
            id.remove();
        }
    }
}
