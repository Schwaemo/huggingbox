# HuggingBox: Design Decisions & User Flow Specification

## Authoritative Reference for AI Coding Agents

**This document is the single source of truth for all design, interaction, and implementation decisions. AI agents building this application must follow this spec exactly. When in doubt, this document overrides the PRD and Sprint Plan.**

**Version:** 1.1
**Last Updated:** March 11, 2026

---

## Resolved Product Decisions

These were open questions in the PRD. They are now settled.

| Decision | Resolution | Implication |
|---|---|---|
| **Offline mode** | Full offline support. The app requires internet only to download model weights and metadata. Operations on downloaded models run fully locally. | Downloaded models can run without network calls. |
| **User data collection** | Zero telemetry. No analytics. No usage tracking. No crash reporting. No data leaves the user's machine except calls to the Hugging Face API. | No Sentry. No Mixpanel. No PostHog. No opt-in analytics. The only outbound network calls are to `huggingface.co`. |
| **Product name** | HuggingBox (working title, subject to change). | Use "HuggingBox" throughout the UI. |

---

## 0. Current Implementation Overrides (March 11, 2026)

This section reflects current code behavior and overrides older design text where there is conflict.

### 0.1 Execution Pipeline

Current run sequence:

1. Create/select model environment.
2. Install download dependencies (`huggingface_hub`, `hf_transfer`) if missing.
3. Download model if missing.
4. Detect runtime type from generated code metadata (`RUNTIME:`).
5. Install runtime dependencies before probing.
6. Run dependency probe.
7. Execute model.

### 0.2 Environment Policy

- Virtual environments are isolated per model environment ID.
- If no environment exists, the user chooses:
  - create new isolated environment (recommended), or
  - use an existing environment.
- Auto-install is first-run only per model. Later runs require manual package management through the terminal panel when dependencies are missing.

### 0.3 Workspace and Output Panel

- Phase 2 includes a file explorer next to Monaco.
- Workspace files are stored in the model folder (default file `huggingbox_main.py`).
- Output panel includes an interactive terminal executing commands inside the selected model environment.

### 0.4 Background Runs and Status Bar

- Execution and download continue when user navigates away from the model page.
- Status bar execution segment is clickable and navigates back to the active execution workspace.
- Download speed/ETA includes periodic folder-size sampling every 10 seconds.

---

## 1. Visual Design System

### 1.1 Aesthetic Direction

**Industrial-precision tool aesthetic.** HuggingBox is a developer power tool, not a consumer app. The visual language should feel like a well-made IDE crossed with a hardware diagnostic tool. Think VS Code meets a flight instrument panel.

**Tone:** Clean, dense, information-rich. Not playful. Not corporate. Professional and capable.

**Colour system:**

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `--bg-primary` | `#FFFFFF` | `#1A1A2E` | Main background |
| `--bg-secondary` | `#F4F4F8` | `#16213E` | Panel backgrounds, cards |
| `--bg-tertiary` | `#E8E8EE` | `#0F3460` | Hover states, active items |
| `--bg-editor` | `#FFFFFF` | `#1E1E1E` | Monaco editor background (match VS Code exactly) |
| `--text-primary` | `#1A1A2E` | `#E8E8EE` | Body text |
| `--text-secondary` | `#6B7280` | `#9CA3AF` | Labels, descriptions, metadata |
| `--text-muted` | `#9CA3AF` | `#6B7280` | Timestamps, tertiary info |
| `--accent-primary` | `#FF6B35` | `#FF6B35` | Primary actions, active states. Warm orange — intentionally distinct from the blues and purples dominant in dev tools. |
| `--accent-secondary` | `#2563EB` | `#3B82F6` | Links, secondary interactive elements |
| `--success` | `#059669` | `#10B981` | Successful execution, green indicators |
| `--warning` | `#D97706` | `#F59E0B` | RAM warnings, caution states |
| `--error` | `#DC2626` | `#EF4444` | Errors, failed execution |
| `--border` | `#E5E7EB` | `#2A2A4A` | Panel dividers, card borders |

**Dark mode is the default.** Users can switch to light mode in settings.

**Typography:**

| Element | Font | Weight | Size |
|---|---|---|---|
| UI labels, buttons | `"JetBrains Mono", monospace` | 500 | 13px |
| Body text, descriptions | `"Inter", sans-serif` | 400 | 14px |
| Headings (model names, section titles) | `"Inter", sans-serif` | 600 | 16–20px |
| Code in editor | `"JetBrains Mono", monospace` | 400 | 14px |
| Status bar | `"JetBrains Mono", monospace` | 400 | 12px |
| Model card metadata | `"JetBrains Mono", monospace` | 400 | 12px |

JetBrains Mono is used throughout for anything code-adjacent or data-dense. Inter is used for readable prose. No other fonts.

**Spacing system:** 4px base unit. All spacing is multiples of 4.

| Token | Value |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 12px |
| `--space-lg` | 16px |
| `--space-xl` | 24px |
| `--space-2xl` | 32px |
| `--space-3xl` | 48px |

**Border radius:** 6px for cards and panels. 4px for buttons and inputs. 2px for inline badges.

**Shadows:** Minimal. One level: `0 1px 3px rgba(0,0,0,0.08)` in light mode, `0 1px 3px rgba(0,0,0,0.3)` in dark mode. Used only on floating elements (dropdowns, modals, tooltips). Never on inline cards.

### 1.2 Iconography

Use **Lucide React** icons exclusively. 18px default size, 1.5px stroke width. Colour inherits from parent text colour.

Do not use emoji anywhere in the UI. Do not use custom SVG icons when a Lucide icon exists.

### 1.3 Component Patterns

**Buttons:**

| Type | Appearance | Usage |
|---|---|---|
| Primary | `--accent-primary` background, white text | One per view. "Generate Code", "Run", "Download" |
| Secondary | Transparent background, `--accent-primary` border and text | "Regenerate", "Cancel", "Clear" |
| Ghost | No border, `--text-secondary` text, hover shows `--bg-tertiary` | Toolbar actions, inline actions |
| Danger | `--error` background, white text | "Delete Model", destructive actions |

All buttons: `height: 36px`, `padding: 0 16px`, `border-radius: 4px`, `font-size: 13px`, `font-weight: 500`, `font-family: JetBrains Mono`. Always include a Lucide icon on the left side of the label for primary and secondary buttons.

**Cards:**

Model cards in the browse grid use `--bg-secondary` background, `--border` border, 6px radius. No shadow. On hover: border colour shifts to `--accent-primary` with 0.3 opacity. Cards never have images or thumbnails — they are text-only with structured metadata.

**Inputs:**

All text inputs: `height: 36px`, `--bg-primary` background, `--border` border, `border-radius: 4px`, `padding: 0 12px`. Focus state: `--accent-primary` border, no glow or box-shadow.

---

## 2. Application Layout

### 2.1 Window Structure

The app uses a fixed three-region layout with a header, main content area, and status bar.

```
┌──────────────────────────────────────────────────────────┐
│  Header Bar (48px fixed)                                 │
│  [Logo] [Browse] [My Models] [Settings]        [Theme]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Main Content Area (fills remaining height)              │
│                                                          │
│  Layout depends on current view:                         │
│  - Browse: Model Grid                                    │
│  - Model Detail: Info + Code Editor + Output             │
│  - My Models: Downloaded model list                      │
│  - Settings: Configuration form                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Status Bar (28px fixed)                                 │
│  [RAM: 12.4/16.0 GB] [GPU: NVIDIA RTX 3060 6GB] [Idle] │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Header Bar

- Height: 48px, fixed.
- Background: `--bg-secondary`.
- Left: App logo (text only: "HuggingBox" in JetBrains Mono, 16px, `--accent-primary`).
- Center-left: Navigation tabs. Each tab is a ghost button. Active tab has a 2px `--accent-primary` bottom border.
- Tabs: **Browse** | **My Models** | **Settings**
- Right: Theme toggle button (Sun/Moon Lucide icon). Ghost style.

**No hamburger menu. No sidebar navigation. No drawer.** The header bar is always visible and the navigation is always flat.

### 2.3 Status Bar

- Height: 28px, fixed.
- Background: `--bg-secondary`.
- Font: JetBrains Mono, 12px, `--text-secondary`.
- Left section: RAM usage (`Used / Total GB`), GPU info (name + VRAM or "No GPU detected").
- Center: Execution state button. States include: "Idle", "Running... (elapsed time)", "Running... (installing packages)", "Running... (downloading model)", "Completed (elapsed time)", "Error", "Cancelled".
- Center button behavior: if an execution model is active, clicking the center segment navigates back to that model workspace.
- Right: Python environment status. One of: "Python Ready", "Installing packages...", "Environment Error".

The status bar updates every 2 seconds during execution (RAM usage, elapsed time).

### 2.4 Browse View

This is the default view when the app opens.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  Search Bar + Filters (56px)                             │
│  [🔍 Search models...          ] [Pipeline ▼] [Size ▼]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Model Grid (scrollable)                                 │
│                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ Model Card  │ │ Model Card  │ │ Model Card  │        │
│  │             │ │             │ │             │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ Model Card  │ │ Model Card  │ │ Model Card  │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                          │
│                      Load More                           │
└──────────────────────────────────────────────────────────┘
```

**Search bar:** Full width minus filter dropdowns. Debounce search input by 300ms. Search queries the HF API `?search=` parameter.

**Filter dropdowns:**

| Filter | Options |
|---|---|
| Pipeline type | All, Text Generation, Text Classification, Summarization, Image Classification, Object Detection, Speech Recognition, Text to Speech, Text to Image, Visual QA, (more as sprints add support) |
| Model size | All, Small (< 1GB), Medium (1–5GB), Large (5–20GB), Very Large (> 20GB) |
| Format | All, GGUF, ONNX, SafeTensors, PyTorch |

Filters combine with AND logic. Pipeline filter maps to HF API `?pipeline_tag=`. Size and format filters are applied client-side after fetching results.

**Model Grid:**

- Responsive columns: 3 columns above 1200px, 2 columns above 800px, 1 column below 800px.
- Gap: 16px.
- Infinite scroll: Load 24 models initially, fetch 24 more on scroll-to-bottom. Show "Load More" button as fallback.

**Model Card (grid item):**

```
┌──────────────────────────────────────┐
│  pipeline-tag-badge                  │
│                                      │
│  Organization / Model Name           │  ← Inter 600, 16px, truncate with ellipsis
│                                      │
│  First line of description...        │  ← Inter 400, 13px, --text-secondary, max 2 lines
│                                      │
│  ⬇ 1.2M downloads  ·  2.4 GB        │  ← JetBrains Mono 12px, --text-muted
│  compat-indicator                    │
└──────────────────────────────────────┘
```

**Pipeline tag badge:** Pill shape, 2px radius, JetBrains Mono 11px. Background colour per category:

| Category | Badge colour |
|---|---|
| Text models | `#2563EB` (blue) |
| Vision models | `#7C3AED` (purple) |
| Audio models | `#059669` (green) |
| Image generation | `#DB2777` (pink) |
| Multimodal | `#D97706` (amber) |

**Compatibility indicator:** Small dot + text at bottom-right of card.

- Green dot + "Compatible" : estimated RAM < 60% of system RAM
- Amber dot + "May be tight" : estimated RAM is 60–90% of system RAM
- Red dot + "Too large" : estimated RAM > 90% of system RAM

### 2.5 Model Detail View

Opened when user clicks a model card. This replaces the Browse view content (not a modal, not a new window).

**Back navigation:** A "← Back to Browse" text button in the top-left of the content area. Clicking it returns to the Browse view with scroll position preserved.

**Layout: Two-phase view**

Phase 1 (before code generation):

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Browse                                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Model Info Panel (full width)                           │
│                                                          │
│  Organization / Model Name                               │
│  pipeline-tag-badge                                      │
│                                                          │
│  Description (from model card, max 300 chars, "more" link)│
│                                                          │
│  ┌────────────┬────────────┬────────────┬──────────────┐ │
│  │ Size       │ Downloads  │ Format     │ RAM Est.     │ │
│  │ 2.4 GB     │ 1.2M       │ GGUF       │ ~3.6 GB      │ │
│  └────────────┴────────────┴────────────┴──────────────┘ │
│                                                          │
│  [Compatibility: 🟢 Compatible with your device]         │
│                                                          │
│  [ Generate Code ]  (primary button, large, centered)    │
│  [ View on Hugging Face ↗ ] (ghost button, below)        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Phase 2 (after code generation): The view transitions to the three-panel workspace layout.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Browse          Model Name          [Re-gen]  │
├────────────────────┬─────────────────────────────────────┤
│                    │                                     │
│  Input Panel       │  Code Editor (Monaco)               │
│  (280px fixed)     │  (flexible width)                   │
│                    │                                     │
│  --- Input ---     │  # Generated Python code            │
│  (varies by        │  # with educational comments        │
│  pipeline type)    │                                     │
│                    │  from transformers import...        │
│  Text area for     │                                     │
│  text models       │                                     │
│                    │                                     │
│  Image upload      │                                     │
│  for vision        │                                     │
│                    │                                     │
│  Audio upload      ├─────────────────────────────────────┤
│  for audio         │                                     │
│                    │  Output Panel                       │
│  --- Actions ---   │  (flexible height)                  │
│  [ ▶ Run ]         │                                     │
│  [ ■ Stop ]        │  Text output / Image / Audio /      │
│  (vertically       │  Bounding boxes / Waveform          │
│  stacked)          │  (varies by pipeline type)          │
│                    │                                     │
│  --- Model Info -- │                                     │
│  Size: 2.4 GB      │                                     │
│  Format: GGUF      │                                     │
│  RAM: ~3.6 GB      │                                     │
│                    │                                     │
└────────────────────┴─────────────────────────────────────┘
```

**Panel split rules (current implementation):**

- Input Panel: 280px fixed width, minimum 240px.
- Right workspace column:
  - top region: file explorer + Monaco editor (about 55% height),
  - bottom region: output panel (about 45% height).
- File explorer sits to the left of Monaco (about 230px wide, minimum 190px).
- Output panel includes both streamed model output and an interactive terminal.

### 2.6 My Models View

**Layout:** Single-column list of downloaded models.

```
┌──────────────────────────────────────────────────────────┐
│  My Models                            [Sort ▼] [Search]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  🟢 meta-llama/Llama-3.1-8B-GGUF                    ││
│  │  text-generation  ·  4.2 GB  ·  Last used: 2h ago   ││
│  │                                    [Run] [Delete]    ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  🟢 openai/whisper-large-v3                          ││
│  │  speech-recognition  ·  1.5 GB  ·  Last used: 3d ago││
│  │                                    [Run] [Delete]    ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  Total disk usage: 12.8 GB in ~/HuggingBox/models/      │
└──────────────────────────────────────────────────────────┘
```

- Sort options: Last used (default), Name A–Z, Size largest first, Size smallest first.
- "Run" navigates to Model Detail View Phase 2 with the last-used code pre-loaded in the editor.
- "Delete" shows a confirmation dialog: "Delete model-name? This will free X GB of disk space." Two buttons: "Cancel" (secondary) and "Delete" (danger).
- Total disk usage displayed at the bottom. If no models downloaded, show an empty state: "No models downloaded yet. Browse models to get started." with a "Browse Models" primary button.

### 2.7 Settings View

**Layout:** Single-column form, max-width 640px, centered.

**Sections:**

**2. Hugging Face Token (Optional)**
- Label: "Hugging Face Token (optional)"
- Input: Password field with show/hide toggle.
- Helper text: "Required for gated models (e.g., Llama, Mistral). Get your token at huggingface.co/settings/tokens"
- Validation: Same as above — verify on blur.

**3. Model Storage**
- Label: "Model Storage Directory"
- Input: Read-only text field showing current path + "Change" button that opens native directory picker.
- Default: `~/HuggingBox/models/`
- Below: Disk usage bar showing used/available space.

**4. Default Inference Device**
- Label: "Preferred Device"
- Radio buttons: "Auto (recommended)" | "CPU only" | "GPU (CUDA)"
- "Auto" lets the generated code decide based on hardware detection.

**5. Theme**
- Label: "Appearance"
- Radio buttons: "Dark (default)" | "Light"

**6. About**
- App version number.
- Link: "View on GitHub" (opens external browser).

No other settings. Keep it minimal.

---

## 3. User Flows (Step by Step)

### 3.1 First Launch

```
1. App opens for the first time.
2. Show a single welcome screen (not a multi-step wizard):
   
   ┌─────────────────────────────────────────────┐
   │                                             │
   │  Welcome to HuggingBox                      │
   │                                             │
   │  Run Hugging Face models locally            │
   │  with deterministically generated code.     │
   │                                             │
   │  Hugging Face Token (optional):             │
   │  [HF Token input field             ]        │
   │  Needed for gated models like Llama.        │
   │                                             │
   │  Model storage: ~/HuggingBox/models/        │
   │  [Change]                                   │
   │                                             │
   │  [ Get Started ]                            │
   │                                             │
   └─────────────────────────────────────────────┘

3. \"Get Started\" is enabled by default.
4. On click \"Get Started\":
   - Save HF token if provided, save storage path, 
     transition to Browse view.
5. Hardware detection runs in background during welcome screen.
   Results populate the status bar when Browse view loads.
```

### 3.2 Browsing Models

```
1. User is on Browse view (default after first launch).
2. Browse view loads with default query: popular models sorted by downloads, 
   no filter applied. First 24 results.
3. User can:
   a. Type in search bar → 300ms debounce → new API call → grid updates.
   b. Select pipeline filter → new API call → grid updates.
   c. Select size filter → client-side filter on current results.
   d. Scroll to bottom → load next 24 results, append to grid.
   e. Click a model card → navigate to Model Detail view.
4. Loading state: Skeleton cards (6 placeholders) while API call is in flight.
5. Error state: If HF API fails, show inline banner at top of grid: 
   "Couldn't reach Hugging Face. Check your connection and try again." 
   with "Retry" secondary button.
6. Empty state: If search returns 0 results: 
   "No models found for '[query]'. Try a different search term."
```

### 3.3 Generating Code

```
1. User clicks a model card → Model Detail Phase 1 loads.
2. Model info panel shows metadata fetched from HF API.
   - If model files can't be enumerated (API error), show: 
     "Couldn't load model details. Try again." with Retry button.
3. User clicks "Generate Code" (primary button).
4. Button state changes:
   - Text changes to "Generating..."
   - Spinner icon replaces the normal icon.
   - Button is disabled.
5. App invokes `hf_auto_runner run {model_id}` which:
   - Inspects model config via `huggingface_hub`
   - Routes to correct runtime (llama.cpp, diffusers, transformers)
   - Generates deterministic inference script
   - Passes in user hardware profile
6. `hf_auto_runner` performs code generation locally.
   - On success: 
     - View transitions to Phase 2 (three-panel layout).
     - Generated code populates Monaco editor with Python syntax highlighting.
     - Input Panel pre-fills with appropriate input widget for the pipeline type.

7. "Regenerate" button (top-right of editor area, ghost style):
   - Reruns the deterministic generation system, replaces editor contents.
   - Confirmation if user has edited the code: 
     "You've edited the code. Regenerating will replace your changes. Continue?"
     Buttons: "Regenerate" (secondary), "Cancel" (ghost).
```

### 3.4 Running Code

```
1. User is on Model Detail Phase 2 with code in the editor.
2. User optionally edits code in Monaco editor.
3. User provides input in the Input Panel.
4. User clicks "Run" in the Input Panel.
5. Pre-run orchestration (sequential):
   a. Resolve/select execution environment.
      - If no environment exists, prompt user:
        - Create new isolated environment (recommended), or
        - Reuse an existing environment.
   b. Check/install download dependencies (`huggingface_hub`, `hf_transfer`).
   c. Check model download status and download if missing.
   d. Detect runtime type from generated code metadata (`RUNTIME:`).
   e. Check/install runtime dependencies before dependency probing.
   f. Run dependency probe to collect:
      - missing packages,
      - model-declared requirements,
      - compatibility warnings.
   g. Optionally align model-declared version-pinned requirements.
   h. Install remaining missing packages.
6. Execution begins:
   - Input panel switches from Run to Stop.
   - Status bar center shows running state with elapsed time.
   - Output panel streams stdout.
   - Console section streams stderr/diagnostics.
7. Execution completes:
   - Status bar: Completed.
   - Output panel shows final parsed output.
8. Execution error:
   - Status bar: Error.
   - Output panel and console retain diagnostics for debugging.
9. User clicks Stop during execution:
   - Cancellation command is sent to the running process.
   - Status bar: Cancelled.
```

Current policy note:
- Automatic dependency installation is first-run-only per model. On later runs, missing packages must be installed manually through the terminal panel.
- If user navigates away while running/downloading, work continues in background.

### 3.5 Model Download Flow

```
1. Triggered when user runs a model that isn't downloaded yet, 
   or clicks "Download" explicitly.
2. Download progress appears in the Output Panel:
   ┌─────────────────────────────────────────┐
   │  Downloading meta-llama/Llama-3.1-8B    │
   │                                         │
   │  ████████████░░░░░░░░░  56%  2.4 GB     │
   │  Speed: 45 MB/s  ·  ETA: 28s            │
   │                                         │
   │  [ Cancel Download ]                    │
   └─────────────────────────────────────────┘
   - Implementation note: backend also samples the model folder size every 10 seconds to estimate download speed when file-level progress is sparse.
3. Files download to {storage_path}/{org}/{model_name}/.
4. On complete: "Download complete. Ready to run." 
   Execution proceeds automatically if triggered by Run.
5. On error (network): "Download failed. Check connection and try again." 
   with "Retry" button. Partial downloads are kept for resume.
6. On cancel: Partial files are kept. Next attempt resumes from where it stopped 
   (use HF hub download resume capability).
7. If disk space is insufficient before download starts: 
   "Not enough disk space. Need X GB, Y GB available. 
   Free space or change storage directory in Settings."
   Do NOT start the download.
```

---

## 4. Output Rendering by Pipeline Type

Each pipeline type has a specific output renderer in the Output Panel. The renderer is selected automatically based on the model's `pipeline_tag`.

### 4.1 Text Generation

- **Renderer:** Streaming text display.
- **Behaviour:** Tokens appear one at a time in a monospaced text area. Cursor blinks at the end of the stream.
- **Styling:** JetBrains Mono, 14px, `--text-primary`, on `--bg-primary` background.
- **Toolbar:** Copy button (top-right corner of output area). Character/token count shown below output.
- **After completion:** Text is selectable. Copy button copies all generated text.

### 4.2 Text Classification

- **Renderer:** Label list with confidence bars.
- **Layout:** Vertical list. Each item: label name on left, horizontal bar on right, percentage on far right.
- **Bar colour:** `--accent-primary` for highest confidence, `--text-muted` for others.
- **Sorting:** Descending by confidence.

### 4.3 Summarization

- **Renderer:** Side-by-side text comparison.
- **Layout:** Input text on left (scrollable, `--text-secondary`), generated summary on right (`--text-primary`).
- **Divider:** 1px `--border` line between them.

### 4.4 Image Classification

- Same as text classification but with the uploaded image displayed above the confidence bars.

### 4.5 Object Detection

- **Renderer:** Image canvas with bounding box overlay.
- **Boxes:** 2px solid borders in distinct colours per label. Label text appears above the top-left corner of each box.
- **Colour palette for boxes:** Cycle through: `#FF6B35`, `#2563EB`, `#059669`, `#7C3AED`, `#DB2777`, `#D97706`.
- **Legend:** Below the image, list of detected labels with colour swatches and counts.
- **Interaction:** Hover on a legend item highlights the corresponding boxes. Click toggles visibility.

### 4.6 Image Segmentation

- **Renderer:** Image canvas with coloured mask overlay.
- **Masks:** Semi-transparent fills (50% opacity) using the same colour palette as detection.
- **Toggle:** Checkbox list below image to show/hide individual segment labels.

### 4.7 Speech Recognition (ASR)

- **Renderer:** Transcript text display.
- **Layout:** Audio waveform visualisation at top (if possible, using Web Audio API for the uploaded file), transcript text below.
- **If timestamps available:** Clicking a word scrolls to that timestamp in the waveform. Timestamps shown as subtle inline markers.

### 4.8 Text-to-Speech (TTS)

- **Renderer:** Audio player.
- **Layout:** Standard audio player with play/pause, scrub bar, volume. Download button to save the WAV file.
- **Waveform:** Visual waveform display above the controls.

### 4.9 Text-to-Image (Diffusion)

- **Renderer:** Image gallery.
- **Layout:** If single image: displayed at maximum size that fits the output panel. If multiple: 2x2 grid, click to expand any one.
- **Progress:** During generation, show "Step X/Y" with a progress bar.
- **Actions:** "Save Image" button below each image (saves to user-chosen location via native dialog). "Copy to Clipboard" button.

### 4.10 Visual Question Answering / Image Captioning

- **Renderer:** Image + text answer.
- **Layout:** Uploaded image displayed at half the output panel width. Answer text on the right side.
- **For multi-turn VLMs:** Chat-style display: user messages on right, model responses on left, image shown inline in the first message.

### 4.11 Embeddings / Feature Extraction

- **Renderer:** Structured data display.
- **Layout:** Show vector dimensionality, first 10 values with "..." for rest, copy button for full JSON array.
- **If multiple inputs:** Table format — one row per input, columns for input text and embedding preview.

---

## 5. Code Generation Specification

### 5.1 hf_auto_runner Structure

Every code generation request invokes `hf_auto_runner run <model_id>`. This executes deterministically from Python.
### 5.2 Deterministic Prompt Rules

The Python scripts are generated based on `config.json`.
RULES:
1. The script must be fully self-contained.
2. Include educational comments.
3. Handle common errors gracefully.
4. Use streaming output where applicable.
5. Output ONLY the Python code.
### 5.3 Hardware Parameters

The local script generator factors in:
- Model ID
- Available RAM & VRAM
- Selected Device (CPU/GPU)
### 5.4 Code Parsing Rules

After receiving the generated code from hf_auto_runner:

1. Strip any markdown code fences (` ```python ` / ` ``` `) if present despite the instruction.
2. Validate it's syntactically valid Python (use a basic AST parse check).
3. Extract import statements to determine required packages.
4. Insert into Monaco editor with Python language mode.

### 5.5 Code Caching

- Cache key: `SHA256(model_id + pipeline_tag + formats + gpu_type + ram_tier)`
  - `ram_tier` is bucketed: "low" (<8GB), "medium" (8–16GB), "high" (16–32GB), "very_high" (>32GB)
  - `gpu_type` is: "none", "cuda", "metal"
- Cache stored in SQLite table: `code_cache(cache_key TEXT PRIMARY KEY, model_id TEXT, code TEXT, created_at TEXT)`
- On model page load: check cache first. If hit, load code immediately without API call.
- "Regenerate" button always bypasses cache and makes a fresh API call. New result overwrites cache.

---

## 6. Error Handling Patterns

### 6.1 Error Message Format

All errors displayed to users follow this structure:

```
❌ [Error Category]

[One-sentence plain English description of what went wrong]

Suggestion: [Actionable next step the user can take]

[Collapsible: Full technical details / traceback]
```

### 6.2 Common Error → Suggestion Mapping

| Error Pattern | Category | Suggestion |
|---|---|---|
| `OutOfMemoryError` or `CUDA out of memory` | Memory Error | "This model needs more memory than available. Try editing the code to add `torch_dtype=torch.float16` or `device_map='auto'`, or use a smaller quantised version of this model." |
| `ModuleNotFoundError: No module named 'X'` | Missing Package | "The package 'X' is required. Click 'Install Missing Packages' to install it." (with action button) |
| `OSError: [model] does not appear to have a file named` | Model File Error | "The model files couldn't be found. Try re-downloading the model from My Models." |
| `RuntimeError: CUDA` or `AssertionError: Torch not compiled with CUDA` | GPU Error | "CUDA isn't available on this system. Edit the code to change `device='cuda'` to `device='cpu'`." |
| `requests.exceptions.ConnectionError` | Network Error | "Couldn't download model files. Check your internet connection and try again." |
| `KeyError` / `ValueError` in pipeline | Model Compatibility | "This model may not be compatible with the standard pipeline. Try a different model or edit the code to adjust the loading approach." |
| Process killed (SIGKILL / OOM killer) | System Kill | "The process was killed by your operating system, likely due to memory pressure. Try a smaller model or close other applications." |
| Python process exit code != 0, unrecognised error | Unknown Error | "Something went wrong. Check the error details below. You can edit the code and try again." |

### 6.3 Error Styling

- Error category: `--error` colour, Inter 600, 16px.
- Description: `--text-primary`, Inter 400, 14px.
- Suggestion: `--text-secondary`, Inter 400, 13px. Preceded by "Suggestion:" in `--accent-primary`.
- Collapsible section: "Show details ▼" toggle. Contents in JetBrains Mono 12px, `--text-muted`, pre-formatted.

---

## 7. State Management Architecture

### 7.1 Store Structure (Zustand)

```typescript
interface AppStore {
  // Navigation
  currentView: 'browse' | 'model-detail' | 'my-models' | 'settings';
  selectedModelId: string | null;
  
  // Browse
  searchQuery: string;
  pipelineFilter: string | null;
  sizeFilter: string | null;
  models: HFModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  browseScrollPosition: number;
  
  // Model Detail
  modelDetail: HFModelDetail | null;
  generatedCode: string | null;
  codeGenerating: boolean;
  codeSource: 'generated' | 'cached' | 'edited';
  
  // Execution
  executionState: 'idle' | 'installing' | 'downloading' | 'running' | 'completed' | 'error' | 'cancelled';
  executionOutput: string;
  executionError: string | null;
  executionStartTime: number | null;
  executionElapsed: number;
  
  // Output
  outputType: OutputType; // determined by pipeline_tag
  outputData: any; // varies by type
  
  // System
  systemInfo: {
    totalRam: number;
    availableRam: number;
    gpuName: string | null;
    gpuVram: number | null;
    os: string;
    pythonReady: boolean;
  };
  
  // Settings
  settings: {
    hfToken: string;
    modelStoragePath: string;
    preferredDevice: 'auto' | 'cpu' | 'cuda';
    theme: 'dark' | 'light';
  };
  
  // Downloaded models
  downloadedModels: DownloadedModel[];
}
```

### 7.2 State Persistence

- `settings` → persisted to local JSON config file (`{app_data}/config.json`). Loaded on app start.
- `downloadedModels` → persisted in SQLite. Loaded on app start.
- `browseScrollPosition` → held in memory only. Reset on app restart.
- `generatedCode` cache → persisted in SQLite. Checked before generation.
- Everything else → ephemeral, held in memory.

### 7.3 Data Flow Rules

1. **Hugging Face API calls happen only in the Browse view and Model Detail Phase 1.** Never prefetch models the user hasn't asked for.
2. **Code generation happens only when the user clicks "Generate Code" or "Regenerate."** Never generate code speculatively.
3. **Python execution happens only when the user clicks "Run."** Never auto-execute code.
4. **Settings are saved on field blur, not on explicit "Save" button.** Each field saves independently when focus leaves.

---

## 8. Security & Privacy Constraints

These are non-negotiable.

1. **No outbound network calls except:**
   - `huggingface.co` (model browsing and downloads)
   - No other domains. No CDNs for fonts (bundle them). No external analytics. No telemetry endpoints.

2. **API keys are stored locally only.** In a config file in the app's data directory. They are never logged, never sent to any server other than their respective API endpoints, and never included in error reports.

3. **Code executes in a user-space Python process.** No elevated privileges. No system-level modifications. The Python subprocess runs with the same permissions as the app.

4. **No auto-update that executes code.** The app can check for updates (by fetching a version manifest from a known URL) and notify the user, but it must never download and execute update binaries without explicit user confirmation through a native OS dialog.

5. **Model files are stored where the user specifies.** Default is `~/HuggingBox/models/`. The app never writes model files elsewhere. The app never reads files from directories the user hasn't explicitly configured.

---

## 9. File & Directory Structure

### 9.1 Application Data

```
{platform_app_data}/HuggingBox/
├── config.json              # Settings (API keys, preferences)
├── huggingbox.db            # SQLite database
├── python/                  # Bundled Python environment
│   ├── python.exe           # (Windows)
│   ├── Lib/
│   └── Scripts/
└── temp/                    # Temporary execution files
    ├── current_script.py    # The code being executed
    └── output/              # Generated images, audio, etc.
```

### 9.2 Model Storage (User-Configured)

```
~/HuggingBox/models/         # Default, user can change
├── meta-llama/
│   └── Llama-3.1-8B-Instruct-GGUF/
│       ├── model.gguf
│       └── .huggingbox_meta.json    # Our metadata (download date, size, hash)
├── openai/
│   └── whisper-large-v3/
│       ├── model.safetensors
│       ├── config.json
│       └── .huggingbox_meta.json
```

### 9.3 Project Source Structure

```
huggingbox/
├── src/                          # React frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── HeaderBar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── PanelSplitter.tsx
│   │   ├── browse/
│   │   │   ├── BrowseView.tsx
│   │   │   ├── ModelCard.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── FilterDropdown.tsx
│   │   ├── detail/
│   │   │   ├── ModelDetailView.tsx
│   │   │   ├── ModelInfoPanel.tsx
│   │   │   ├── InputPanel.tsx
│   │   │   ├── CodeEditor.tsx
│   │   │   └── OutputPanel.tsx
│   │   ├── output-renderers/
│   │   │   ├── TextStreamRenderer.tsx
│   │   │   ├── ClassificationRenderer.tsx
│   │   │   ├── ImageCanvasRenderer.tsx
│   │   │   ├── AudioPlayerRenderer.tsx
│   │   │   ├── ImageGalleryRenderer.tsx
│   │   │   └── EmbeddingRenderer.tsx
│   │   ├── my-models/
│   │   │   ├── MyModelsView.tsx
│   │   │   └── DownloadedModelRow.tsx
│   │   ├── settings/
│   │   │   └── SettingsView.tsx
│   │   └── shared/
│   │       ├── Button.tsx
│   │       ├── Badge.tsx
│   │       ├── Modal.tsx
│   │       └── ProgressBar.tsx
│   ├── stores/
│   │   └── appStore.ts
│   ├── hooks/
│   │   ├── useHuggingFace.ts
│   │   ├── useCodeGeneration.ts
│   │   ├── useExecution.ts
│   │   └── useSystemInfo.ts
│   ├── services/
│   │   ├── huggingfaceApi.ts
│   │   ├── hfAutoRunner.ts
│   │   ├── pythonSidecar.ts
│   │   └── database.ts
│   ├── utils/
│   │   ├── ramEstimation.ts
│   │   ├── importParser.ts
│   │   └── formatDetection.ts
│   └── styles/
│       └── globals.css          # CSS variables, Tailwind config
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── system_info.rs
│   │   │   ├── python_runner.rs
│   │   │   ├── file_manager.rs
│   │   │   └── model_storage.rs
│   │   └── sidecar/
│   │       └── python_manager.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── AGENTS.md                    # AI agent instructions
└── README.md
```

---

## 10. Interaction Details & Edge Cases

### 10.1 Monaco Editor Behaviour

- Language: Python (always, since all generated code is Python).
- Theme: Match app theme. Dark → `vs-dark`, Light → `vs`.
- Tab size: 4 spaces.
- Word wrap: off by default.
- Minimap: off (wastes space in a constrained panel).
- Line numbers: on.
- Read-only: never. The user can always edit.
- Font: JetBrains Mono, 14px.

### 10.2 Input Panel Behaviour by Pipeline Type

| Pipeline Type | Input Widget |
|---|---|
| text-generation | Textarea, auto-grow up to 200px height, placeholder: "Enter your prompt..." |
| text-classification | Textarea, placeholder: "Enter text to classify..." |
| summarization | Textarea, larger (300px), placeholder: "Paste text to summarise..." |
| question-answering | Two textareas: "Context" (larger) and "Question" (smaller) |
| image-classification, object-detection, image-segmentation | Image drop zone (dashed border, 200px height). "Upload Image" button. Preview thumbnail after upload. |
| automatic-speech-recognition | Audio drop zone. "Upload Audio" button. "Record" microphone button. Playback preview after upload. |
| text-to-speech | Textarea, placeholder: "Enter text to speak..." |
| text-to-image | Textarea for prompt. Collapsible "Advanced" section with: Steps (slider, 1–100, default 30), Guidance scale (slider, 1–20, default 7.5), Seed (number input, empty = random), Negative prompt (textarea). |
| visual-question-answering | Image drop zone + textarea for question. |
| feature-extraction | Textarea, placeholder: "Enter text for embedding..." |

### 10.3 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Enter` | Run code (equivalent to clicking Run button) |
| `Ctrl/Cmd + Shift + Enter` | Stop execution |
| `Ctrl/Cmd + G` | Generate code (on Model Detail Phase 1) |
| `Ctrl/Cmd + Shift + G` | Regenerate code |
| `Ctrl/Cmd + 1` | Navigate to Browse |
| `Ctrl/Cmd + 2` | Navigate to My Models |
| `Ctrl/Cmd + 3` | Navigate to Settings |
| `Escape` | Close any open modal or dropdown |

### 10.4 Drag-and-Drop Behaviour

- Files dropped on the Input Panel: accepted if they match the expected type (images for vision, audio for ASR/TTS). Rejected types show a brief toast: "Expected an image file" / "Expected an audio file".
- Files dropped elsewhere in the app: ignored silently.
- Multiple files dropped: only the first is accepted. Show toast: "Only one file at a time is supported."

### 10.5 Window Resizing

- Minimum window size: 1024 x 640.
- Below 1024px width: the three-panel layout stacks the Input Panel above the editor/output area instead of beside it.
- The status bar, header bar, and Monaco editor must remain usable at minimum size.

### 10.6 Concurrent Operation Rules

- Only one model can be executed at a time. If the user navigates to a different model while execution is running, the execution continues in the background. The status bar still shows "Running...".
- The user can browse models while a download is in progress. Download progress remains visible in the status bar.
- Two downloads cannot run simultaneously. If user tries to download a second model, show: "A download is already in progress. Please wait for it to complete."

---

## 11. Loading & Empty States

Every view must handle these three states explicitly.

### Loading States

- **Browse grid loading:** 6 skeleton cards (rectangular, animated shimmer, same size as real cards).
- **Model detail loading:** Skeleton lines for title, description, metadata row.
- **Code generating:** Spinner animation in the center of the editor area. Text below: "Generating code locally..."
- **Package installing:** Progress text in Output Panel: "Installing {package}..."
- **Model downloading:** Progress bar with speed and ETA in Output Panel.
- **Code running:** Spinner in Output Panel. For streaming text, the first token replaces the spinner.

### Empty States

- **Browse: no results:** "No models found. Try a different search term or filter." Centered in grid area, `--text-muted`.
- **My Models: no downloads:** "No models downloaded yet." with "Browse Models" primary button. Centered.
- **Output Panel: before first run:** Faded text: "Run code to see output here." with a keyboard shortcut hint: "Ctrl+Enter to run". Centered vertically and horizontally.
- **Code Editor: before generation:** Faded text: "Click 'Generate Code' to get started, or write your own Python code." Centered.

### Error States

- All errors follow the format in Section 6.1.
- Errors are displayed inline in the relevant panel (Output Panel for execution errors, Browse grid for API errors, Settings for validation errors).
- No full-screen error pages. No error toasts that auto-dismiss. Errors persist until the user takes action or retries.

---

## 12. Animation & Transitions

Keep animations minimal and functional. This is a power tool, not a consumer app.

- **View transitions:** None. Views switch instantly. No slide, no fade.
- **Panel resize:** Smooth resize following cursor. No animation delay.
- **Button state changes:** 150ms transition on background-color and border-color.
- **Hover effects:** 100ms transition on opacity and background-color.
- **Loading shimmer:** CSS animation, 1.5s duration, linear, infinite.
- **Dropdown open/close:** 100ms opacity fade. No slide or scale.
- **Modal open/close:** 150ms opacity fade + slight scale (0.98 → 1.0). Backdrop fades in simultaneously.
- **Token streaming:** No animation per token. Tokens simply appear (append to text content).
- **Progress bars:** Smooth width transition, 200ms.

No spring physics. No bounce effects. No parallax. No particle effects.

---

## 13. Accessibility Requirements

- All interactive elements must be keyboard-navigable (tab order follows visual order).
- Focus indicators: 2px `--accent-primary` outline, 2px offset. Visible in both themes.
- All images in the Output Panel have alt text (auto-generated: "Model output: [pipeline_type] result").
- Colour is never the only indicator of state. The compatibility indicator uses both colour AND text ("Compatible", "May be tight", "Too large").
- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text and UI components (WCAG AA).
- Screen reader: All buttons have descriptive `aria-label` attributes. Status bar content is an `aria-live` region.
- Dropdown menus use proper `role="listbox"` and `role="option"` semantics.
- Modal dialogs trap focus and return focus to the trigger element on close.

