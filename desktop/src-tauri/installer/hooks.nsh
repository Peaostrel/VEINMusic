; Look of the VEINMusic installer. Tauri includes this file after MUI2.nsh
; and before the pages (bundle > windows > nsis > installerHooks), so these
; defines reach Modern UI. Colours are the site's (frontend/app/globals.css).

; Dark welcome, finish and header areas with light text
!define MUI_BGCOLOR "0E0F10"
!define MUI_TEXTCOLOR "EDEDEB"
; Themed checkboxes ignore MUI_TEXTCOLOR and would draw black text on the
; dark finish page ("Запустить VEINMusic")
!define MUI_FORCECLASSICCONTROLS
; Logo on the right of the header, page title on the left
!define MUI_HEADERIMAGE_RIGHT
; Installation log in the site's surface colours
!define MUI_INSTFILESPAGE_COLORS "EDEDEB 16171A"
