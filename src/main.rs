use adw::prelude::*;
use webkit6::prelude::*;

const APP_ID: &str = "dev.mikaeww.Leech";

fn main() -> gtk::glib::ExitCode {
    let app = adw::Application::builder().application_id(APP_ID).build();
    app.connect_activate(|app| {
        let web = webkit6::WebView::new();
        web.load_uri("https://duckduckgo.com");
        let window = adw::ApplicationWindow::builder()
            .application(app)
            .title("Leech")
            .default_width(1280)
            .default_height(820)
            .content(&web)
            .build();
        window.present();
    });
    app.run()
}
