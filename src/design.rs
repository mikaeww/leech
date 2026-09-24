use adw::prelude::*;

#[derive(Clone, Copy)]
pub enum Curve {
    /// Moves between two places.
    Glide,
    /// Arrive, leave, reorder.
    Settle,
    /// Hover, dismiss.
    Quick,
}

/// SwiftUI's spring(response, damping) is stiffness (2π/response)², mass 1.
fn spring(response: f64, damping: f64) -> adw::SpringParams {
    let stiffness = (std::f64::consts::TAU / response).powi(2);
    adw::SpringParams::new(damping, 1.0, stiffness)
}

pub fn animate(widget: &impl IsA<gtk::Widget>, from: f64, to: f64, curve: Curve, step: impl Fn(f64) + 'static) -> adw::Animation {
    let target = adw::CallbackAnimationTarget::new(step);
    let animation: adw::Animation = match curve {
        Curve::Glide | Curve::Settle => {
            let params = if matches!(curve, Curve::Glide) { spring(0.34, 0.82) } else { spring(0.30, 0.86) };
            let a = adw::SpringAnimation::new(widget, from, to, params, target);
            a.set_epsilon(0.0005);
            a.upcast()
        }
        Curve::Quick => {
            let a = adw::TimedAnimation::new(widget, from, to, 140, target);
            a.set_easing(adw::Easing::EaseOutCubic);
            a.upcast()
        }
    };
    animation.play();
    animation
}

pub fn install_style() {
    let provider = gtk::CssProvider::new();
    provider.load_from_string(include_str!("style.css"));
    gtk::style_context_add_provider_for_display(
        &gtk::gdk::Display::default().expect("a display"),
        &provider,
        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

pub fn apply_look(look: &str) {
    let scheme = match look {
        "light" => adw::ColorScheme::ForceLight,
        "dark" => adw::ColorScheme::ForceDark,
        _ => adw::ColorScheme::Default,
    };
    adw::StyleManager::default().set_color_scheme(scheme);
}

/// The palette hangs off a `dark` class on the window, following libadwaita's resolved scheme.
pub fn follow_dark(window: &impl IsA<gtk::Widget>) {
    let window = window.as_ref().clone();
    let manager = adw::StyleManager::default();
    let apply = move |m: &adw::StyleManager| {
        if m.is_dark() { window.add_css_class("dark") } else { window.remove_css_class("dark") }
    };
    apply(&manager);
    manager.connect_dark_notify(apply);
}

pub fn ground() -> gtk::gdk::RGBA {
    let dark = adw::StyleManager::default().is_dark();
    let v = if dark { 0.11 } else { 1.0 };
    gtk::gdk::RGBA::new(v, v, v, 1.0)
}
