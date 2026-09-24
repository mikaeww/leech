use gtk::glib;
use gtk::subclass::prelude::*;

type Allocate = Box<dyn Fn(&gtk::Widget, i32, i32)>;

mod imp {
    use super::*;
    use std::cell::{Cell, RefCell};

    #[derive(Default)]
    pub struct Manual {
        pub allocate: RefCell<Option<Allocate>>,
        pub height: Cell<i32>,
    }

    #[glib::object_subclass]
    impl ObjectSubclass for Manual {
        const NAME: &'static str = "LeechManualLayout";
        type Type = super::Manual;
        type ParentType = gtk::LayoutManager;
    }

    impl ObjectImpl for Manual {}

    impl LayoutManagerImpl for Manual {
        fn request_mode(&self, _: &gtk::Widget) -> gtk::SizeRequestMode {
            gtk::SizeRequestMode::ConstantSize
        }

        fn measure(&self, _: &gtk::Widget, orientation: gtk::Orientation, _: i32) -> (i32, i32, i32, i32) {
            match orientation {
                gtk::Orientation::Vertical => (self.height.get(), self.height.get(), -1, -1),
                _ => (0, 0, -1, -1),
            }
        }

        fn allocate(&self, widget: &gtk::Widget, width: i32, height: i32, _: i32) {
            if let Some(f) = self.allocate.borrow().as_ref() {
                f(widget, width, height);
            }
        }
    }
}

glib::wrapper! {
    /// A layout whose children are placed by hand; it asks for no width and a fixed height.
    pub struct Manual(ObjectSubclass<imp::Manual>) @extends gtk::LayoutManager;
}

pub fn manual(height: i32, allocate: impl Fn(&gtk::Widget, i32, i32) + 'static) -> Manual {
    let layout: Manual = glib::Object::new();
    layout.imp().height.set(height);
    layout.imp().allocate.replace(Some(Box::new(allocate)));
    layout
}
