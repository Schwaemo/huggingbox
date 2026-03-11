# Product Requirements Document: HuggingBox

## Local AI Model Runner & Code Generator

**Version:** 1.0
**Last Updated:** March 2026
**Author:** tng4480
**Status:** Draft

---

## 1. Product Overview

### 1.1 Vision

HuggingBox is a cross-platform desktop application that turns Hugging Face into a local AI app store. Users browse models, click one, and get deterministically-generated Python code ready to run on their machine via `hf_auto_runner` — no terminal, no environment setup, no guesswork.

### 1.3 Core Insight

Instead of building a universal runtime abstraction, HuggingBox uses a deterministic `hf_auto_runner` to read model cards, config.json, and metadata to generate correct, well-commented, editable Python code for the user.

### 1.4 Target Users

| Segment | Description | Primary Need |
|---|---|---|
| **Curious beginners** | Non-technical users who want to try AI models | One-click code generation, guided experience |
| **Students & learners** | CS/ML students exploring model architectures | Readable, well-commented generated code |
| **Intermediate developers** | Developers who know Python but not the ML ecosystem | Skip boilerplate, jump straight to experimentation |
| **Advanced practitioners** | ML engineers evaluating models quickly | Fast local testing, full code control |

---

## 2. Competitive Landscape

| Product | Local Inference | Model Browsing | Multi-Modal | Code Visibility | Cross-Platform |
|---|---|---|---|---|---|
| Hugging Face Spaces | No (remote) | Yes | Yes | No | Web only |
| Ollama | Yes | Limited | LLMs only | No | Desktop |
| LM Studio | Yes | Own catalogue | LLMs only | No | Desktop |
| GPT4All | Yes | Limited | LLMs only | No | Desktop |
| WebLLM | Yes (browser) | No | LLMs only | No | Web only |
| **HuggingBox** | **Yes** | **Full HF catalogue** | **Yes** | **Yes (editable)** | **Desktop → all** |

### 2.1 Key Differentiator

No existing product combines Hugging Face catalogue browsing, local multi-modal execution, and visible/editable generated code. The closest analogy is \"a local Jupyter notebook that writes itself, connected to every model on Hugging Face.\"

---|---|---|
| **Curious beginners** | Non-technical users who want to try AI models | One-click code generation, guided experience |
| **Students & learners** | CS/ML students exploring model architectures | Readable, well-commented generated code |
| **Intermediate developers** | Developers who know Python but not the ML ecosystem | Skip boilerplate, jump straight to experimentation |
| **Advanced practitioners** | ML engineers evaluating models quickly | Fast local testing, full code control |

---

## 2. Competitive Landscape

| Product | Local Inference | Model Browsing | Multi-Modal | Code Visibility | Cross-Platform |
|---|---|---|---|---|---|
| Hugging Face Spaces | No (remote) | Yes | Yes | No | Web only |
| Ollama | Yes | Limited | LLMs only | No | Desktop |
| LM Studio | Yes | Own catalogue | LLMs only | No | Desktop |
| GPT4All | Yes | Limited | LLMs only | No | Desktop |
| WebLLM | Yes (browser) | No | LLMs only | No | Web only |
| **HuggingBox** | **Yes** | **Full HF catalogue** | **Yes** | **Yes (editable)** | **Desktop → all** |

### 2.1 Key Differentiator

No existing product combines Hugging Face catalogue browsing, local multi-modal execution, and visible/editable generated code. The closest analogy is "a local Jupyter notebook that writes itself, connected to every model on Hugging Face."

---

## 3. User Flow

### 3.1 Happy Path

```
Open app
  → Browse / search Hugging Face models
  → Click a model
  → View model card: description, size, RAM estimate, pipeline type
  → Click "Generate Code"
  → hf_auto_runner inspects model metadata via huggingface_hub, detects architecture, selects runtime, and generates deterministic Python code
  → Code appears in embedded editor (Monaco)
  → User reviews / edits code (optional)
  → Click "Run"
  → App checks dependencies, installs if missing
  → Python sidecar executes code
  → Output streams into result panel (text / image / audio)
  → User iterates: edit code, re-run, try different inputs
```

### 3.2 First-Time Setup

```
Install app
  → App detects system: OS, RAM, GPU, disk space
  → App installs base Python environment (bundled or managed)
  → Core packages pre-installed: transformers, torch, onnxruntime
  → User sets model storage directory
  → Ready to browse
```

### 3.3 Returning User

```
Open app
  → "My Models" tab shows previously downloaded models
  → Click model → code editor pre-populated with last session's code
  → Run immediately, no re-download needed
```

---

## 4. Product Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                  Desktop Shell                   │
│               (Tauri / Electron)                 │
│                                                  │
│  ┌─────────────┬──────────────┬──────────────┐  │
│  │   Model      │    Code      │   Output     │  │
│  │   Browser    │    Editor    │   Panel      │  │
│  │             │   (Monaco)   │              │  │
│  │  - Search    │             │  - Text      │  │
│  │  - Filter    │  - Generated │  - Images    │  │
│  │  - Model     │  - Editable  │  - Audio     │  │
│  │    cards     │  - Syntax HL │  - Streaming │  │
│  └─────────────┴──────────────┴──────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │              Status Bar                       ││
│  │  RAM usage | GPU status | Download progress   ││
│  └──────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼─────┐       ┌──────▼───────┐
   │ hf_auto_ │       │   Python     │
   │ runner   │       │   Sidecar    │
   │          │       │              │
   │ Inspects │       │ Executes     │
    │ metadata,│       │ generated    │
    │ generates│       │ code in      │
    │ code     │       │ managed      │
   │ code     │       │ environment  │
   └──────────┘       └──────────────┘
```

### 4.2 Component Breakdown

#### Frontend (Renderer Process)

| Component | Technology | Purpose |
|---|---|---|
| App shell | Tauri (preferred) or Electron | Desktop wrapper, native OS integration |
| UI framework | React + TypeScript | Component-based UI |
| Styling | Tailwind CSS | Rapid, consistent styling |
| Code editor | Monaco Editor | Full IDE-grade editing experience |
| State management | Zustand or Redux Toolkit | App state, model cache, session history |

#### Code Generation Layer

| Component | Technology | Purpose |
|---|---|---|
| Code Generator | hf_auto_runner (deterministic Python system) | Generate inference code from config.json and architecture type |
| Runtime Router | Architecture matching logic | Route to correct runtime based on config.json |
| Code cache | Local SQLite | Cache generated code per model to reduce API calls |

#### Execution Layer

| Component | Technology | Purpose |
|---|---|---|
| Process manager | Node child_process / Tauri sidecar API | Spawn, monitor, kill Python processes |
| Python environment | Bundled or managed Python 3.11+ | Isolated runtime for model execution |
| Dependency manager | pip + requirements resolution | Install missing packages on demand |
| Output capture | stdout/stderr streaming + file watchers | Pipe results back to frontend |

#### Data Layer

| Component | Technology | Purpose |
|---|---|---|
| Model metadata | Hugging Face API | Browse, search, filter models |
| Model storage | Local filesystem (user-configured) | Downloaded model weights |
| App database | SQLite | User preferences, download history, cached code |
| Session state | In-memory | Current editor state, run history |

---

## 5. Code Generation System

### 5.1 How It Works

When a user selects a model, the app:

1. Fetches model metadata from the Hugging Face API (pipeline_tag, model card, file list, config).
2. Invokes hf_auto_runner which reads config.json, detects the architecture, selects the runtime, and considers user's system specs (RAM, GPU).
3. hf_auto_runner deterministically orchestrates environment creation, package installation, and emits execution script via script_generator.py.
4. The generated code appears in the Monaco editor.
5. The user can edit, then run.

### 5.2 Prompt Structure

The code generation logic factors in:
- Model ID and pipeline type
- `config.json` (model_type, architectures)
- File formats (.gguf vs .safetensors)
- User's hardware profile (RAM, GPU type, VRAM)
- Target output format (stdout for text, file path for images/audio)
### 5.3 Code Style Requirements

All generated code must:

- Be fully self-contained (no external imports beyond standard ML libraries)
- Include comments explaining what each block does and why
- Print or save output in a format the app can capture
- Handle common errors gracefully (OOM, missing files, CUDA unavailable)
- Respect the user's hardware constraints (default to CPU if no GPU detected)
- Use streaming/progressive output where applicable (token-by-token for LLMs)

### 5.4 Code Caching Strategy

- Cache generated code per model ID + hardware profile hash
- Serve cached code instantly on repeat visits
- Allow user to "Regenerate" to get fresh code
- Invalidate cache when model is updated on Hugging Face

### 5.5 Fallback Behavior

Since hf_auto_runner is local, offline mode is fully supported (as long as models are downloaded).
- Mark the code as "template-generated" in the editor with a note that richer generation is available when online

---

## 6. Execution Environment

### 6.1 Python Environment Management

**Option A: Bundled Environment (Recommended for Phase 1)**

Ship a self-contained Python distribution with the app installer. Pre-install core packages:

- `transformers`
- `torch` (CPU build initially, GPU build optional download)
- `onnxruntime`
- `Pillow`
- `soundfile`
- `accelerate`
- `sentencepiece`

Approximate base environment size: 3–5 GB.

**Option B: Managed System Python (Phase 2)**

Detect existing Python installations, create a dedicated virtual environment, install dependencies as needed. Lighter installer but more fragile.

### 6.2 Dynamic Dependency Installation

When the user clicks "Run":

1. App parses import statements in the editor code.
2. Compares against installed packages in the managed environment.
3. If missing packages detected, prompt user: "This model requires `diffusers`. Install now?"
4. Install via pip into the managed environment.
5. Cache the dependency resolution so subsequent runs skip this step.

### 6.3 Process Lifecycle

```
User clicks "Run"
  → Parse imports, check dependencies
  → Spawn Python subprocess with managed environment
  → Stream stdout to output panel in real time
  → Stream stderr to error console
  → Monitor memory usage (warn if approaching limit)
  → On completion: parse output (text/image/audio) and render
  → On error: display traceback in error panel with readable formatting
  → On user cancel: send SIGTERM, clean up temp files
```

### 6.4 Output Handling by Pipeline Type

| Pipeline Type | Output Format | Frontend Rendering |
|---|---|---|
| text-generation | Streaming stdout (token by token) | Live text display, typewriter effect |
| text-classification | JSON to stdout | Label + confidence bar chart |
| summarization | Text to stdout | Side-by-side input/output |
| image-classification | JSON to stdout | Label + confidence scores |
| object-detection | JSON to stdout + annotated image file | Image with bounding box overlay |
| image-segmentation | Segmentation mask file | Image with colored mask overlay |
| automatic-speech-recognition | Text to stdout | Transcript display + audio playback |
| text-to-speech | WAV file output | Audio player |
| text-to-image | PNG file output | Image gallery view |
| visual-question-answering | Text to stdout | Image + question + answer layout |

---

## 7. Model Discovery & Browsing

### 7.1 Data Source

Primary: Hugging Face API (`https://huggingface.co/api/models`)

Fields consumed:

- `modelId` — display name and download identifier
- `pipeline_tag` — determines UI template and code generation approach
- `tags` — filtering and categorization
- `downloads` — popularity sorting
- `lastModified` — freshness indicator
- `siblings` — file list for format detection and size estimation
- `cardData` — license, datasets, metrics

### 7.2 Browse Interface

**Default view:** Curated feed of popular, well-supported models organized by category (text, vision, audio, multimodal, image generation).

**Search:** Full-text search against model names and tags.

**Filters:**

- Pipeline type (text-generation, image-classification, etc.)
- Model size (small < 1GB, medium 1–5GB, large 5–20GB, very large > 20GB)
- Format availability (GGUF, ONNX, SafeTensors)
- Compatibility (runs on my device / may not fit in RAM)
- Popularity (downloads, trending)

### 7.3 Model Detail Page

Displays:

- Model name and author
- Description (from model card)
- Pipeline type badge
- Total download size
- Estimated RAM requirement
- Device compatibility indicator (green/yellow/red)
- Available formats
- Download count and community rating
- "Generate Code" button (primary CTA)
- "View on Hugging Face" link

### 7.4 Device Compatibility Estimation

| Model Type | RAM Estimate Formula | Notes |
|---|---|---|
| Text models (general) | 2 × model file size | Includes tokenizer overhead |
| LLMs (GGUF quantized) | 1.2 × file size | Efficient memory-mapped loading |
| LLMs (full precision) | 2.5–3 × model file size | Significant overhead |
| Vision models | 1.5 × model file size | Batch processing adds overhead |
| Diffusion models | Flat 6–10 GB | Largely independent of file size |
| Audio models | 1.5 × model file size | Audio buffer overhead |

Compatibility levels:

- **Green:** Estimated RAM < 60% of available system RAM
- **Yellow:** Estimated RAM is 60–90% of available RAM (show warning)
- **Red:** Estimated RAM > 90% of available RAM (strong warning, suggest quantized alternatives)

---

## 8. Local Model Management

### 8.1 Storage

- Default location: `~/HuggingBox/models/` (user-configurable)
- Directory structure: `{storage_path}/{org}/{model_name}/`
- Track downloaded models in local SQLite database

### 8.2 My Models Tab

Displays all downloaded models with:

- Model name and pipeline type
- Size on disk
- Last used date
- Quick actions: Run (opens editor with last code), Delete, Update check

### 8.3 Cleanup & Management

- Delete individual models from "My Models"
- Bulk cleanup: sort by last used, size, select multiple for deletion
- Settings: set max storage limit, auto-warn when approaching limit
- Show total disk usage in settings

---

## 9. System Requirements Detection

On first launch and periodically, detect:

| Property | Method | Used For |
|---|---|---|
| Total RAM | OS query | Compatibility estimation |
| Available RAM | OS query | Runtime warnings |
| GPU presence | CUDA / Metal / Vulkan detection | Code generation (device selection) |
| GPU VRAM | Driver query | Large model feasibility |
| Disk space | Filesystem query | Download feasibility |
| OS and architecture | System info | Environment compatibility |

Surface this information in a "System Info" panel in settings and use it to inform the deterministic code generation logic (e.g., generate CPU-only code if no GPU detected, use float16 if GPU supports it).

---

## 10. Design Principles

### 10.1 UX Principles

1. **Transparency over magic.** Show the user what's happening. The code is visible. The dependencies are listed. The RAM usage is displayed. No hidden processes.

2. **Progressive complexity.** Beginners click "Generate Code" and "Run." Intermediate users edit the generated code. Advanced users write from scratch. The same interface serves all three.

3. **Failure is informative.** When things go wrong (OOM, missing dependency, model incompatibility), the error is displayed in context alongside the code, with actionable suggestions.

4. **Education built in.** Every generated code snippet includes comments explaining what's happening. Users learn ML engineering patterns by using the app.

5. **Local first.** All inference runs on the user's device. The only external calls are to the Hugging Face API (model metadata) .

### 10.2 Technical Principles

1. **Prefer Tauri over Electron.** Smaller binary size, lower memory overhead, Rust backend for process management.
2. **Python is an execution target, not a distribution dependency.** The Python environment is managed, not exposed to the user.
3. **Cache aggressively.** Model metadata, generated code, dependency resolution results — minimize redundant API calls and computation.
4. **Degrade gracefully.** If model config is unknown, fall back to generic transformers loader. If GPU is unavailable, default to CPU. If RAM is tight, suggest quantized models.

---

## 11. Phased Development Plan

### Phase 1: Core Desktop App (Weeks 1–8)

**Goal:** Working Windows app that browses Hugging Face, generates code for text models, and runs them locally.

**Scope:**

- Tauri desktop shell with React frontend
- Model browser connected to Hugging Face API (search, filter, model detail pages)
- hf_auto_runner integration for code generation
- Monaco editor embedded in app
- Python sidecar with bundled environment (transformers, torch CPU, onnxruntime)
- Execution engine: spawn Python process, stream stdout to output panel
- Support for pipeline types: text-generation, text-classification, summarization
- GGUF model support via llama-cpp-python
- Basic device detection (RAM, GPU presence)
- Local model storage and "My Models" tab
- Code caching in SQLite

**Deliverable:** Downloadable Windows installer. User can browse HF, pick a text model, generate code, and run inference locally.

### Phase 2: Multi-Modal & Polish (Weeks 9–16)

**Goal:** Expand to vision, audio, and image generation. Improve UX and reliability.

**Scope:**

- Vision model support (image-classification, object-detection, segmentation)
- Audio model support (speech recognition, text-to-speech)
- Image generation support (Stable Diffusion via diffusers)
- Rich output rendering (image viewer, audio player, bounding box overlays)
- Dynamic dependency installation (detect missing packages, prompt user, install)
- Improved error handling and user-friendly error messages
- GPU acceleration support (CUDA on Windows)
- Model size and compatibility warnings
- macOS build (Metal GPU support)

**Deliverable:** Windows + macOS installers supporting text, vision, audio, and image generation models.

### Phase 3: Platform Expansion & Community (Weeks 17–24)

**Goal:** Linux support, community features, and advanced capabilities.

**Scope:**

- Linux build
- Model collections and user-curated lists
- Code snippet sharing (export/import)
- Session history (replay previous experiments)
- Automatic format detection and conversion suggestions (e.g., "an ONNX version of this model is available and would run faster on your hardware")
- Performance benchmarking (tokens/sec, inference time)
- Hugging Face account integration (access gated models with user's HF token)

**Deliverable:** Cross-platform desktop app with community features.

### Phase 4: Web & Mobile (Weeks 25+)

**Goal:** Expand beyond desktop.

**Scope:**

- Web version using WebGPU / WebAssembly for in-browser inference (limited model support)
- Mobile companion app (iOS/Android) for small models via ONNX Runtime Mobile or CoreML/NNAPI
- Cloud-hybrid option: run large models on rented GPU instances if local hardware insufficient

**Deliverable:** Web and mobile apps extending the HuggingBox experience.

---

## 12. Key Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| hf_auto_runner generates incorrect/broken code | High | Code is visible and editable. Fallback to local templates. Cache known-good generations. Build a test suite against popular models. |
| Python environment packaging bloats installer | High | Use Tauri (smaller base). Offer "minimal install" (CPU only, ~2GB) and "full install" (GPU, ~5GB). Download GPU support on demand. |
| Hugging Face model metadata is inconsistent | Medium | Build a supplementary compatibility database for popular models. Continuously update runtime_router.py to handle edge cases. Allow user to manually select pipeline type. |
| OOM crashes on user devices | High | Conservative RAM estimates. Clear warnings before download. Monitor memory during execution. Suggest quantized alternatives when available. |
| Maintenance of deterministic rules | Medium | Keep script_generator.py templates updated for new popular architectures. |
| Model authors change formats or break compatibility | Medium | Pin model revisions on download. Check for updates but don't auto-update. |
| Security risk from executing user-editable code | Low | Code runs in a managed Python environment. No elevated privileges. Users already trust local code execution (same model as VS Code terminals). Document the trust model clearly. |

---

## 13. Success Metrics

### 13.1 Launch Metrics (Phase 1)

- Number of app installs
- Models browsed per session
- Code generation success rate (generated code runs without errors on first attempt)
- Percentage of users who successfully run a model locally within first session

### 13.2 Engagement Metrics

- Models run per user per week
- Code edit rate (percentage of users who modify generated code before running)
- Return rate (users who come back within 7 days)
- Average session duration

### 13.3 Quality Metrics

- First-run success rate per pipeline type
- Error rate by model type
- Time from "click model" to "see output"
- Dependency installation success rate

---

## 14. Open Questions

1. **Naming:** "HuggingBox" is a working title. Final name TBD.
2. **Monetization:** Completely free and offline since code generation uses deterministic heuristics without LLM cost.
3. **Hugging Face partnership:** Should this integrate formally with Hugging Face (OAuth, gated model access) from Phase 1 or later?
4. **Offline mode:** Should the code generation layer have a robust offline fallback (local small LLM for code gen) or is "templates only" sufficient?
5. **Telemetry:** What usage data, if any, should be collected? Opt-in analytics for improving code generation quality?
