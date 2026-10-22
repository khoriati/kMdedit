// Menu nativo estilo macOS. Cada item emite o evento "menu" com seu id;
// o frontend (ui/app.js) decide a ação. Atalhos ficam no menu nativo.
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accel)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = Submenu::with_items(app, "kMdedit", true, &[
        &PredefinedMenuItem::about(app, Some("Sobre kMdedit"), None)?,
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
        &item(app, "new", "Novo", Some("CmdOrCtrl+N"))?,
        &item(app, "open", "Abrir…", Some("CmdOrCtrl+O"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "save", "Salvar", Some("CmdOrCtrl+S"))?,
        &item(app, "saveAs", "Salvar como…", Some("CmdOrCtrl+Shift+S"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "close", "Fechar aba", Some("CmdOrCtrl+W"))?,
    ])?;

    let edit = Submenu::with_items(app, "Editar", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "find", "Localizar…", Some("CmdOrCtrl+F"))?,
    ])?;

    let format = Submenu::with_items(app, "Formatar", true, &[
        &item(app, "h1", "Título 1", Some("CmdOrCtrl+1"))?,
        &item(app, "h2", "Título 2", Some("CmdOrCtrl+2"))?,
        &item(app, "h3", "Título 3", Some("CmdOrCtrl+3"))?,
        &item(app, "paragraph", "Parágrafo", None)?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "bold", "Negrito", Some("CmdOrCtrl+B"))?,
        &item(app, "italic", "Itálico", Some("CmdOrCtrl+I"))?,
        &item(app, "strike", "Tachado", None)?,
        &item(app, "code", "Código inline", Some("CmdOrCtrl+E"))?,
        &item(app, "link", "Link…", Some("CmdOrCtrl+K"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "ul", "Lista", Some("CmdOrCtrl+Alt+U"))?,
        &item(app, "ol", "Lista numerada", Some("CmdOrCtrl+Alt+O"))?,
        &item(app, "task", "Lista de tarefas", Some("CmdOrCtrl+Alt+X"))?,
        &item(app, "quote", "Citação", Some("CmdOrCtrl+Alt+Q"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "codeblock", "Bloco de código", Some("CmdOrCtrl+Alt+C"))?,
        &item(app, "mermaid", "Diagrama Mermaid", Some("CmdOrCtrl+Alt+M"))?,
        &item(app, "hr", "Linha horizontal", Some("CmdOrCtrl+Alt+-"))?,
    ])?;

    let view = Submenu::with_items(app, "Visualizar", true, &[
        &item(app, "modeWysiwyg", "WYSIWYG", None)?,
        &item(app, "modeSource", "Código-fonte", None)?,
        &item(app, "modeRender", "Visualizar", None)?,
        &item(app, "mode", "Alternar modo", Some("CmdOrCtrl+Shift+R"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "zoomIn", "Aumentar zoom", Some("CmdOrCtrl+="))?,
        &item(app, "zoomOut", "Diminuir zoom", Some("CmdOrCtrl+-"))?,
        &item(app, "zoomReset", "Tamanho real", Some("CmdOrCtrl+0"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "themeLight", "Tema claro", None)?,
        &item(app, "themeDark", "Tema escuro", None)?,
        &item(app, "themeContrast", "Alto contraste", None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;

    // Sem "Fechar janela" aqui: o Cmd+W pertence a "Fechar aba".
    let window = Submenu::with_items(app, "Janela", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::maximize(app, None)?,
    ])?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &format, &view, &window])
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit("menu", id.to_string());
}
