Place bundled ffmpeg binaries in this directory for packaged builds.

Expected filenames:
- Windows: `ffmpeg.exe`
- macOS/Linux: `ffmpeg`

At runtime HuggingBox resolves ffmpeg in this order:
1. Tauri bundled resource dir `bin/`
2. Dev fallback `src-tauri/bin/`
3. System `PATH`

If no bundled binary is present, audio runtimes will fall back to any system-installed ffmpeg.
