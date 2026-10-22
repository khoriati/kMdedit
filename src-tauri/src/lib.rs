// Backend kMdedit: leitura/escrita atômica de arquivos de texto.
//
// `read_text` aceita qualquer arquivo desde que seja texto UTF-8 (sem NUL,
// poucos bytes de controle) e dentro do limite de tamanho; é o que permite
// arrastar um .txt/.md para a janela. `write_text` grava via temp + rename
// para nunca deixar o arquivo pela metade.
use std::fs;
use std::path::Path;

mod menu;

/// Limite de tamanho para abrir um arquivo (16 MiB).
const MAX_BYTES: u64 = 16 * 1024 * 1024;

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

/// Heurística de "é texto": sem NUL e com menos de 5% de bytes de controle
/// na amostra inicial (tabs, quebras de linha e form feed não contam).
fn looks_like_text(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(8192)];
    if sample.is_empty() {
        return true;
    }
    if sample.contains(&0) {
        return false;
    }
    let control = sample
        .iter()
        .filter(|&&b| b < 0x20 && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0c))
        .count();
    control * 20 < sample.len()
}

fn read_text_impl(path: &str) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("não foi possível acessar o arquivo: {e}"))?;
    if !meta.is_file() {
        return Err("o caminho não é um arquivo".into());
    }
    if meta.len() > MAX_BYTES {
        return Err(format!("arquivo grande demais ({} bytes; limite {} bytes)", meta.len(), MAX_BYTES));
    }
    let bytes = fs::read(path).map_err(|e| format!("não foi possível ler o arquivo: {e}"))?;
    if !looks_like_text(&bytes) {
        return Err("o arquivo não parece ser texto".into());
    }
    let text = String::from_utf8(bytes).map_err(|_| "o arquivo não está em UTF-8".to_string())?;
    Ok(normalize_newlines(text.trim_start_matches('\u{feff}')))
}

fn write_text_impl(path: &str, text: &str) -> Result<usize, String> {
    let target = Path::new(path);
    if target.is_dir() {
        return Err("o caminho é um diretório".into());
    }
    let data = normalize_newlines(text);
    let tmp = format!("{path}.{}.tmp", std::process::id());
    fs::write(&tmp, &data).map_err(|e| format!("não foi possível gravar: {e}"))?;
    if let Err(e) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("não foi possível substituir o arquivo: {e}"));
    }
    Ok(data.len())
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    read_text_impl(&path)
}

#[tauri::command]
fn write_text(path: String, text: String) -> Result<usize, String> {
    write_text_impl(&path, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("kmdedit-test-{tag}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn normaliza_quebras_de_linha() {
        assert_eq!(normalize_newlines("a\r\nb\rc"), "a\nb\nc");
    }

    #[test]
    fn detecta_texto_e_binario() {
        assert!(looks_like_text(b""));
        assert!(looks_like_text("# Oi\n\tcom tab\r\n".as_bytes()));
        assert!(!looks_like_text(b"abc\0def"));
        assert!(!looks_like_text(&[1, 2, 3, 4, 5, b'a', b'b']));
    }

    #[test]
    fn escrita_e_leitura_roundtrip_em_md_e_txt() {
        let dir = tmp_dir("rt");
        for name in ["doc.md", "notas.txt"] {
            let p = dir.join(name).to_string_lossy().to_string();
            write_text_impl(&p, "# Oi\r\nmermaid").unwrap();
            assert_eq!(read_text_impl(&p).unwrap(), "# Oi\nmermaid");
            write_text_impl(&p, "alterado").unwrap();
            assert_eq!(read_text_impl(&p).unwrap(), "alterado");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn recusa_binario_utf8_invalido_e_inexistente() {
        let dir = tmp_dir("bin");
        let bin = dir.join("img.png");
        fs::write(&bin, [0x89, b'P', b'N', b'G', 0, 1, 2]).unwrap();
        assert!(read_text_impl(&bin.to_string_lossy()).unwrap_err().contains("não parece ser texto"));
        let latin = dir.join("latin1.txt");
        fs::write(&latin, [b'c', 0xe7, b'a', b'o']).unwrap();
        assert!(read_text_impl(&latin.to_string_lossy()).unwrap_err().contains("UTF-8"));
        assert!(read_text_impl(&dir.join("nao-existe.md").to_string_lossy()).is_err());
        assert!(read_text_impl(&dir.to_string_lossy()).unwrap_err().contains("não é um arquivo"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_bom_na_leitura() {
        let dir = tmp_dir("bom");
        let p = dir.join("bom.md");
        fs::write(&p, "\u{feff}# T\n").unwrap();
        assert_eq!(read_text_impl(&p.to_string_lossy()).unwrap(), "# T\n");
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text, write_text])
        .setup(|app| {
            let m = menu::build(app.handle())?;
            app.set_menu(m)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .run(tauri::generate_context!())
        .expect("erro ao iniciar kMdedit");
}
