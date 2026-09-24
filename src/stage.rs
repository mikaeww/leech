use crate::browser::Browser;
use crate::tab::Tab;
use gtk::prelude::*;
use std::rc::{Rc, Weak};

/// The page area: one child per built web view, plus the blank ground and the failure note.
pub struct Stage {
    pub root: gtk::Stack,
    message: gtk::Label,
}

impl Stage {
    pub fn new(browser: &Rc<Browser>) -> Rc<Self> {
        let root = gtk::Stack::new();
        root.set_hexpand(true);
        root.set_vexpand(true);
        let blank = gtk::Box::new(gtk::Orientation::Vertical, 0);
        blank.add_css_class("ground");
        root.add_named(&blank, Some("blank"));

        let message = gtk::Label::new(None);
        message.add_css_class("message");
        let retry = gtk::Button::with_label("Try again");
        retry.set_halign(gtk::Align::Center);
        retry.set_focusable(false);
        let b: Weak<Browser> = Rc::downgrade(browser);
        retry.connect_clicked(move |_| if let Some(b) = b.upgrade() { b.reload_or_stop() });
        let failure = gtk::Box::new(gtk::Orientation::Vertical, 10);
        failure.add_css_class("failure");
        failure.add_css_class("ground");
        failure.set_valign(gtk::Align::Center);
        failure.append(&message);
        failure.append(&retry);
        root.add_named(&failure, Some("failure"));
        Rc::new(Stage { root, message })
    }

    pub fn show(&self, tab: Option<&Tab>) {
        let Some(tab) = tab else {
            self.root.set_visible_child_name("blank");
            return;
        };
        if let Some(text) = tab.failure.borrow().as_ref() {
            self.message.set_label(text);
            self.root.set_visible_child_name("failure");
            return;
        }
        match tab.view() {
            Some(web) if !tab.is_blank() => {
                let name = format!("t{}", tab.id);
                if self.root.child_by_name(&name).is_none() {
                    self.root.add_named(&web, Some(&name));
                }
                self.root.set_visible_child(&web);
            }
            _ => self.root.set_visible_child_name("blank"),
        }
    }

    pub fn forget(&self, tab: &Tab) {
        if let Some(child) = self.root.child_by_name(&format!("t{}", tab.id)) {
            self.root.remove(&child);
        }
    }
}
