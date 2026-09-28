//! VEINMusic for Windows: the site in a window, a tray icon and a scrobbler
//! for everything that plays on the computer (read from the Windows media
//! panel and sent to the API with the key the account issued to the app).

mod api;
mod discord;
mod media;
mod settings;
mod tracker;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

use api::{Api, ApiError, Update};
use settings::Settings;
use tracker::{Snapshot, Tracker};

const MAIN: &str = "main";
const SETTINGS: &str = "settings";
const POLL_EVERY: Duration = Duration::from_secs(3);
const UPDATE_CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// Launched by Windows at sign-in: start in the tray only.
const MINIMIZED_ARG: &str = "--minimized";

/// A pairing in progress: the code shown to the user.
#[derive(Clone, Serialize)]
struct Pairing {
    user_code: String,
    url: String,
}

#[derive(Clone, Serialize)]
struct NowPlaying {
    title: String,
    artist: String,
    player: String,
}

struct Inner {
    settings: Settings,
    settings_path: PathBuf,
    api_key: Option<String>,
    pairing: Option<Pairing>,
    /// Bumped by each new pairing, so a stale poll loop stops.
    pairing_id: u64,
    now_playing: Option<NowPlaying>,
    message: Option<String>,
    update: Option<Update>,
}

struct AppState {
    inner: Mutex<Inner>,
    api: Api,
}

struct TrayItems {
    now: MenuItem<tauri::Wry>,
    scrobbling: CheckMenuItem<tauri::Wry>,
    update: MenuItem<tauri::Wry>,
}

/// What the settings window shows.
#[derive(Clone, Serialize)]
struct StateDto {
    version: &'static str,
    paired: bool,
    username: Option<String>,
    settings: Settings,
    autostart: bool,
    discord_available: bool,
    pairing: Option<Pairing>,
    now_playing: Option<NowPlaying>,
    message: Option<String>,
    update: Option<UpdateDto>,
}

#[derive(Clone, Serialize)]
struct UpdateDto {
    version: String,
    url: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn state_dto(app: &AppHandle) -> StateDto {
    let state = app.state::<AppState>();
    let inner = state.inner.lock().unwrap();
    StateDto {
        version: env!("CARGO_PKG_VERSION"),
        paired: inner.api_key.is_some(),
        username: inner.settings.username.clone(),
        settings: inner.settings.clone(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        discord_available: discord::available(),
        pairing: inner.pairing.clone(),
        now_playing: inner.now_playing.clone(),
        message: inner.message.clone(),
        update: inner.update.as_ref().map(|u| UpdateDto {
            version: u.version.clone(),
            url: u.url.clone(),
        }),
    }
}

/// Tell the settings window (if open) that something changed.
fn notify(app: &AppHandle) {
    let _ = app.emit_to(SETTINGS, "state", state_dto(app));
}

fn save_settings(app: &AppHandle) {
    let state = app.state::<AppState>();
    let inner = state.inner.lock().unwrap();
    if let Err(e) = inner.settings.save(&inner.settings_path) {
        log::warn!("settings not saved: {e}");
    }
}

fn set_message(app: &AppHandle, message: Option<String>) {
    app.state::<AppState>().inner.lock().unwrap().message = message;
    notify(app);
}

// --- windows -----------------------------------------------------------------

fn site_url(path: &str) -> tauri::Url {
    format!("{}{}", api::site_base(), path)
        .parse()
        .expect("site URL")
}

fn show_main(app: &AppHandle, path: Option<&str>) {
    let window = match app.get_webview_window(MAIN) {
        Some(w) => w,
        None => match build_main(app, true) {
            Ok(w) => w,
            Err(e) => {
                log::error!("main window: {e}");
                return;
            }
        },
    };
    if let Some(path) = path {
        let _ = window.navigate(site_url(path));
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn build_main(app: &AppHandle, visible: bool) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(site_url("/")))
        .title("VEINMusic")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .visible(visible)
        .build()?;
    // Closing the window keeps the app (and the scrobbler) in the tray
    let hidden = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hidden.hide();
        }
    });
    Ok(window)
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("index.html".into()))
        .title("Настройки VEINMusic")
        .inner_size(460.0, 760.0)
        .resizable(false)
        .maximizable(false)
        .build();
    if let Err(e) = built {
        log::error!("settings window: {e}");
    }
}

// --- tray --------------------------------------------------------------------

fn build_tray(app: &AppHandle, scrobbling: bool) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть VEINMusic", true, None::<&str>)?;
    let now = MenuItem::with_id(app, "now", "Ничего не играет", false, None::<&str>)?;
    let scrobbling = CheckMenuItem::with_id(
        app,
        "scrobbling",
        "Скробблинг",
        true,
        scrobbling,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Настройки приложения", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Проверить обновления", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &now,
            &PredefinedMenuItem::separator(app)?,
            &scrobbling,
            &settings,
            &update,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    app.manage(TrayItems {
        now,
        scrobbling,
        update,
    });

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("VEINMusic")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app, None),
            "settings" => show_settings(app),
            "scrobbling" => {
                let on = {
                    let state = app.state::<AppState>();
                    let mut inner = state.inner.lock().unwrap();
                    inner.settings.scrobbling = !inner.settings.scrobbling;
                    inner.settings.scrobbling
                };
                save_settings(app);
                let _ = app.state::<TrayItems>().scrobbling.set_checked(on);
                notify(app);
            }
            "update" => on_update_item(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle(), None);
            }
        })
        .build(app)?;
    Ok(())
}

fn on_update_item(app: &AppHandle) {
    let update = app.state::<AppState>().inner.lock().unwrap().update.clone();
    match update {
        Some(u) => {
            let _ = app.opener().open_url(u.url, None::<&str>);
        }
        None => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move { check_update(&app).await });
        }
    }
}

fn show_now_playing_in_tray(app: &AppHandle, now: Option<&NowPlaying>) {
    let text = match now {
        Some(n) => format!("{} — {} ({})", n.artist, n.title, n.player),
        None => "Ничего не играет".to_string(),
    };
    let short: String = text.chars().take(60).collect();
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.now.set_text(&short);
    }
    if let Some(tray) = app.tray_by_id("main") {
        let tip = match now {
            Some(_) => format!("VEINMusic: {short}"),
            None => "VEINMusic".to_string(),
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

// --- commands (settings window only) ------------------------------------------

fn from_settings(window: &Window) -> Result<(), String> {
    if window.label() == SETTINGS {
        Ok(())
    } else {
        Err("forbidden".into())
    }
}

#[tauri::command]
fn get_state(window: Window, app: AppHandle) -> Result<StateDto, String> {
    from_settings(&window)?;
    Ok(state_dto(&app))
}

#[tauri::command]
fn set_option(
    window: Window,
    app: AppHandle,
    name: String,
    value: bool,
) -> Result<StateDto, String> {
    from_settings(&window)?;
    if name == "autostart" {
        let autolaunch = app.autolaunch();
        let result = if value {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| format!("Автозапуск: {e}"))?;
    } else {
        let changed = app
            .state::<AppState>()
            .inner
            .lock()
            .unwrap()
            .settings
            .set(&name, value);
        if !changed {
            return Err(format!("unknown option {name}"));
        }
        save_settings(&app);
        if name == "scrobbling" {
            let _ = app.state::<TrayItems>().scrobbling.set_checked(value);
        }
    }
    notify(&app);
    Ok(state_dto(&app))
}

#[tauri::command]
async fn start_pairing(window: Window, app: AppHandle) -> Result<StateDto, String> {
    from_settings(&window)?;
    let api = app.state::<AppState>().api.clone();
    let code = api.start_pairing().await.map_err(|e| e.to_string())?;
    let pairing_id = {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        inner.pairing_id += 1;
        inner.pairing = Some(Pairing {
            user_code: code.user_code.clone(),
            url: code.verification_uri_complete.clone(),
        });
        inner.message = None;
        inner.pairing_id
    };
    // The confirmation page opens in the app's window, where the user is
    // (or signs in) on the site
    if let Ok(url) = code.verification_uri_complete.parse() {
        show_main(&app, None);
        if let Some(main) = app.get_webview_window(MAIN) {
            let _ = main.navigate(url);
        }
    }
    let poll_app = app.clone();
    tauri::async_runtime::spawn(async move { poll_pairing(poll_app, code, pairing_id).await });
    notify(&app);
    Ok(state_dto(&app))
}

#[tauri::command]
fn cancel_pairing(window: Window, app: AppHandle) -> Result<StateDto, String> {
    from_settings(&window)?;
    {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        inner.pairing = None;
        inner.pairing_id += 1;
    }
    notify(&app);
    Ok(state_dto(&app))
}

#[tauri::command]
fn logout(window: Window, app: AppHandle) -> Result<StateDto, String> {
    from_settings(&window)?;
    settings::delete_api_key();
    {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        inner.api_key = None;
        inner.settings.username = None;
        inner.message = Some(
            "Аккаунт отключён. Ключ приложения можно отозвать на сайте: Настройки → Безопасность и данные."
                .into(),
        );
    }
    save_settings(&app);
    notify(&app);
    Ok(state_dto(&app))
}

#[tauri::command]
fn open_site(window: Window, app: AppHandle, path: Option<String>) -> Result<(), String> {
    from_settings(&window)?;
    let path = path.filter(|p| p.starts_with('/'));
    show_main(&app, path.as_deref());
    Ok(())
}

#[tauri::command]
fn open_update(window: Window, app: AppHandle) -> Result<(), String> {
    from_settings(&window)?;
    on_update_item(&app);
    Ok(())
}

// --- pairing -------------------------------------------------------------------

async fn poll_pairing(app: AppHandle, code: api::DeviceCode, pairing_id: u64) {
    let api = app.state::<AppState>().api.clone();
    let deadline = now_ms() + code.expires_in * 1000;
    let every = Duration::from_secs(code.interval.max(2));
    while now_ms() < deadline {
        tokio::time::sleep(every).await;
        if app.state::<AppState>().inner.lock().unwrap().pairing_id != pairing_id {
            return; // cancelled or restarted
        }
        let answer = match api.poll_token(&code.device_code).await {
            Ok(answer) => answer,
            Err(e) => {
                log::warn!("pairing poll: {e}");
                continue;
            }
        };
        match answer.status.as_str() {
            "pending" => continue,
            "approved" => {
                if let (Some(key), Some(username)) = (answer.api_key, answer.username) {
                    finish_pairing(&app, &key, &username).await;
                }
                return;
            }
            "denied" => return end_pairing(&app, "Подключение отклонено на сайте."),
            _ => return end_pairing(&app, "Код устарел. Попробуйте ещё раз."),
        }
    }
    end_pairing(&app, "Код устарел. Попробуйте ещё раз.");
}

fn end_pairing(app: &AppHandle, message: &str) {
    {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        inner.pairing = None;
        inner.message = Some(message.into());
    }
    notify(app);
}

async fn finish_pairing(app: &AppHandle, key: &str, username: &str) {
    if let Err(e) = settings::save_api_key(key) {
        log::error!("{e}");
        end_pairing(app, &e);
        return;
    }
    let api = app.state::<AppState>().api.clone();
    let yandex_linked = api.yandex_linked(key, username).await.unwrap_or(false);
    {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        inner.api_key = Some(key.to_string());
        inner.settings.username = Some(username.to_string());
        // Yandex connected on the site is scrobbled by the server directly:
        // the app would count it twice
        inner.settings.sources.yandex = !yandex_linked;
        inner.pairing = None;
        inner.message = Some(format!("Готово: аккаунт @{username} подключён."));
    }
    save_settings(app);
    // Scrobbling needs the app running: start it with Windows by default
    let _ = app.autolaunch().enable();
    show_main(app, Some(&format!("/user/{username}")));
    notify(app);
}

// --- scrobbling -------------------------------------------------------------------

async fn scrobble_loop(app: AppHandle) {
    let mut tracker = Tracker::default();
    let mut discord = discord::Discord::default();
    loop {
        tokio::time::sleep(POLL_EVERY).await;
        let (key, settings) = {
            let state = app.state::<AppState>();
            let inner = state.inner.lock().unwrap();
            (inner.api_key.clone(), inner.settings.clone())
        };
        let sessions = tauri::async_runtime::spawn_blocking(media::read_sessions)
            .await
            .unwrap_or_default();
        let playing = tracker::pick(&sessions, |kind| settings.sources.allows(kind));

        update_now_playing(&app, playing.as_ref());
        let shown = playing
            .clone()
            .filter(|_| settings.discord && discord::available());
        discord = tauri::async_runtime::spawn_blocking(move || {
            discord.show(shown.as_ref());
            discord
        })
        .await
        .unwrap_or_default();

        let Some(key) = key else {
            tracker.reset();
            continue;
        };
        let current = playing.filter(|_| settings.scrobbling);
        report(&app, &mut tracker, &key, current.as_ref()).await;
    }
}

async fn report(app: &AppHandle, tracker: &mut Tracker, key: &str, playing: Option<&Snapshot>) {
    let now = now_ms();
    let Some(report) = tracker.decide(playing, now) else {
        return;
    };
    let api = app.state::<AppState>().api.clone();
    match api.scrobble(key, &report).await {
        // Refused for now (another report a moment ago): retried next poll
        Ok(status) if status == "rate_limited" || status == "ignored_spam_protection" => {}
        Ok(_) => {
            tracker.sent(&report, now);
            let had_message = app
                .state::<AppState>()
                .inner
                .lock()
                .unwrap()
                .message
                .is_some();
            if had_message {
                set_message(app, None);
            }
        }
        Err(ApiError::Unauthorized) => {
            set_message(
                app,
                Some("Ключ приложения отозван. Подключите аккаунт заново.".into()),
            );
            settings::delete_api_key();
            app.state::<AppState>().inner.lock().unwrap().api_key = None;
            tracker.reset();
            notify(app);
        }
        Err(e) => log::warn!("scrobble: {e}"),
    }
}

fn update_now_playing(app: &AppHandle, playing: Option<&Snapshot>) {
    let now = playing.map(|t| NowPlaying {
        title: t.title.clone(),
        artist: t.artist.clone(),
        player: tracker::player_label(&t.app_id),
    });
    let changed = {
        let state = app.state::<AppState>();
        let mut inner = state.inner.lock().unwrap();
        let before = inner
            .now_playing
            .as_ref()
            .map(|n| (n.title.clone(), n.artist.clone()));
        let after = now.as_ref().map(|n| (n.title.clone(), n.artist.clone()));
        inner.now_playing = now.clone();
        before != after
    };
    if changed {
        show_now_playing_in_tray(app, now.as_ref());
        notify(app);
    }
}

// --- updates -----------------------------------------------------------------------

async fn check_update(app: &AppHandle) {
    let api = app.state::<AppState>().api.clone();
    let Some(update) = api.check_update().await else {
        return;
    };
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items
            .update
            .set_text(format!("Обновить до {}", update.version));
    }
    app.state::<AppState>().inner.lock().unwrap().update = Some(update);
    notify(app);
}

async fn update_loop(app: AppHandle) {
    loop {
        check_update(&app).await;
        tokio::time::sleep(UPDATE_CHECK_EVERY).await;
    }
}

// --- app -----------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let minimized = std::env::args().any(|a| a == MINIMIZED_ARG);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app, None)
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_option,
            start_pairing,
            cancel_pairing,
            logout,
            open_site,
            open_update
        ])
        .setup(move |app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let settings = Settings::load(&settings_path);
            let api_key = settings::load_api_key();
            let paired = api_key.is_some();
            let scrobbling = settings.scrobbling;
            app.manage(AppState {
                inner: Mutex::new(Inner {
                    settings,
                    settings_path,
                    api_key,
                    pairing: None,
                    pairing_id: 0,
                    now_playing: None,
                    message: None,
                    update: None,
                }),
                api: Api::new(),
            });

            let handle = app.handle().clone();
            build_tray(&handle, scrobbling)?;
            build_main(&handle, !minimized)?;
            if !paired {
                show_settings(&handle); // first run: connect the account
            }
            tauri::async_runtime::spawn(scrobble_loop(handle.clone()));
            tauri::async_runtime::spawn(update_loop(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("VEINMusic failed to start")
        .run(|_app, event| {
            // Closing every window keeps the app in the tray
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
            }
        });
}
