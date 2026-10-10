// Menu nativo estilo macOS. Cada item emite o evento "menu" com seu id;
// o frontend (ui/app.js) decide a ação. Atalhos ficam no menu nativo.
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = Submenu::with_items(app, "mdedit", true, &[
        &PredefinedMenuItem::about(app, Some("Sobre mdedit"), None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::services(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;

    let file = Submenu::with_items(app, "Arquivo", true, &[
        &MenuItem::with_id(app, "new", "Novo", true, Some("CmdOrCtrl+N"))?,
        &MenuItem::with_id(app, "open", "Abrir…", true, Some("CmdOrCtrl+O"))?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "save", "Salvar", true, Some("CmdOrCtrl+S"))?,
        &MenuItem::with_id(app, "saveAs", "Salvar como…", true, Some("CmdOrCtrl+Shift+S"))?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "close", "Fechar aba", true, Some("CmdOrCtrl+W"))?,
    ])?;

    let edit = Submenu::with_items(app, "Editar", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;

    let view = Submenu::with_items(app, "Visualizar", true, &[
        &MenuItem::with_id(app, "mode", "Alternar modo (WYSIWYG / Código / Visualizar)", true, Some("CmdOrCtrl+Shift+R"))?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "zoomIn", "Aumentar zoom", true, Some("CmdOrCtrl+="))?,
        &MenuItem::with_id(app, "zoomOut", "Diminuir zoom", true, Some("CmdOrCtrl+-"))?,
        &MenuItem::with_id(app, "zoomReset", "Tamanho real", true, Some("CmdOrCtrl+0"))?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "themeLight", "Tema claro", true, None::<&str>)?,
        &MenuItem::with_id(app, "themeDark", "Tema escuro", true, None::<&str>)?,
        &MenuItem::with_id(app, "themeContrast", "Alto contraste", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;

    let window = Submenu::with_items(app, "Janela", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::maximize(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit("menu", id.to_string());
}
