#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// إشعارات سطح المكتب الأصلية (بديل setTimeout عند إغلاق النافذة بالحد الأدنى)
use tauri_plugin_notification::NotificationExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("خطأ في تشغيل رفيق الصحة");
    let _ = NotificationExt::notification; // مرجع لتفعيل الـ plugin
}
