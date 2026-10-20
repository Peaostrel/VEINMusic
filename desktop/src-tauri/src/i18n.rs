//! Interface language: Russian on Russian-speaking systems (ru, uk, be, kk),
//! English otherwise. Read once from the Windows UI language
//! (GetUserDefaultUILanguage); elsewhere (dev builds) from LC_ALL /
//! LC_MESSAGES / LANG.

use std::sync::OnceLock;

/// Primary language ids (LANGID & 0x3ff) of Russian, Ukrainian, Belarusian
/// and Kazakh.
#[cfg(windows)]
const RUSSIAN_SPEAKING_LANGIDS: [u16; 4] = [0x19, 0x22, 0x23, 0x3f];
#[cfg(any(not(windows), test))]
const RUSSIAN_SPEAKING_CODES: [&str; 4] = ["ru", "uk", "be", "kk"];

/// True when the app speaks Russian.
pub fn ru() -> bool {
    static RU: OnceLock<bool> = OnceLock::new();
    *RU.get_or_init(detect)
}

/// "ru" or "en", for the settings window.
pub fn lang() -> &'static str {
    if ru() {
        "ru"
    } else {
        "en"
    }
}

/// The Russian or the English text.
pub fn tr(ru_text: &'static str, en_text: &'static str) -> &'static str {
    if ru() {
        ru_text
    } else {
        en_text
    }
}

/// Whether a locale code such as "ru_RU.UTF-8", "uk-UA" or "be" is
/// Russian-speaking.
#[cfg(any(not(windows), test))]
pub fn is_russian_code(code: &str) -> bool {
    let primary = code
        .split(['_', '-', '.', '@'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    RUSSIAN_SPEAKING_CODES.contains(&primary.as_str())
}

#[cfg(windows)]
fn detect() -> bool {
    // SAFETY: no arguments, returns the LANGID of the user's UI language
    let langid = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() };
    RUSSIAN_SPEAKING_LANGIDS.contains(&(langid & 0x3ff))
}

#[cfg(not(windows))]
fn detect() -> bool {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|v| !v.is_empty())
        .is_some_and(|v| is_russian_code(&v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn russian_codes() {
        for code in ["ru", "ru_RU.UTF-8", "uk-UA", "be_BY", "kk_KZ.UTF-8", "RU"] {
            assert!(is_russian_code(code), "{code}");
        }
        for code in ["en_US.UTF-8", "de", "C", "POSIX", "", "rue"] {
            assert!(!is_russian_code(code), "{code}");
        }
    }
}
