mod address;
mod browser;
mod design;
mod engine;
mod history;
mod layout;
mod omnibox;
mod prefs;
mod session;
mod stage;
mod store;
mod tab;
mod tabbar;

use adw::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

const APP_ID: &str = "dev.mikaeww.Leech";

fn main() -> gtk::glib::ExitCode {
    let app = adw::Application::builder()
        .application_id(APP_ID)
        .flags(gtk::gio::ApplicationFlags::HANDLES_OPEN)
        .build();
    let browser: Rc<RefCell<Option<Rc<browser::Browser>>>> = Rc::default();

    let slot = browser.clone();
    app.connect_startup(|_| design::install_style());
    app.connect_activate(move |app| {
        let b = slot.borrow_mut().get_or_insert_with(|| browser::Browser::new(app)).clone();
        b.window.present();
    });
    let slot = browser.clone();
    app.connect_open(move |app, files, _| {
        let b = slot.borrow_mut().get_or_insert_with(|| browser::Browser::new(app)).clone();
        for file in files {
            b.arrive(&file.uri());
        }
        b.window.present();
    });
    let slot = browser.clone();
    app.connect_shutdown(move |_| {
        if let Some(b) = slot.borrow().as_ref() {
            b.flush();
        }
    });
    app.run()
}
