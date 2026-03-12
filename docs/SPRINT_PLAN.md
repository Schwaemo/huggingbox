# HuggingBox: Staged Sprint Development Plan

## Agentic AI-Assisted Build Strategy

**Version:** 1.1
**Last Updated:** March 11, 2026
**Related Document:** docs/PRD.md

---

## Plan Overview

This plan breaks HuggingBox development into 10 sprints, each two weeks long. Each sprint targets a specific capability layer — starting with the UI shell and progressively adding model type compatibility. By the end of Sprint 10, the app supports the majority of models on Hugging Face across text, vision, audio, image generation, and multimodal categories.

Each sprint includes a section on **agentic AI tooling** — the specific MCP servers, coding tools, skills, and techniques that an engineer using Cursor/AI IDE, Cursor, or similar tools should leverage to maximise output quality and speed.

---

## Current Implementation Snapshot (March 11, 2026)

Implemented in code today:

- Per-model virtual environments with optional environment reuse.
- First-run-only auto dependency installation policy.
- Runtime dependency installation before dependency probing.
- Dependency probe plus model-declared requirement alignment support.
- Background execution/download continuation while navigating.
- Clickable status bar execution state that returns to active model workspace.
- Model workspace file explorer + autosaved files (stored in model folder).
- Interactive terminal in output panel running inside model venv.
- Download telemetry with periodic folder-size sampling every 10 seconds.

This section reflects current shipped behavior and should be used to assess sprint completion state.

---

## Recommended Base Tooling (All Sprints)

These tools and MCP servers should be configured from day one and used throughout the entire project.

### AI Coding Environment

| Tool | Purpose |
|---|---|
| **Cursor/AI IDE** | Primary agentic coding tool. Terminal-based, 200K context, deep file editing. Use for backend logic, process management, complex integrations. |
| **Cursor** | IDE-based AI coding. Use for frontend React work, visual editing, tab completions. |
| **GitHub Copilot** | Background completions and inline suggestions in VS Code. |

### Persistent MCP Servers

| MCP Server | Purpose |
|---|---|
| **GitHub MCP Server** | PR management, issue tracking, CI/CD integration. The most-used MCP server in the ecosystem — install first. |
| **Hugging Face MCP Server** | Search models, datasets, Spaces. Explore metadata, pipeline tags, file lists. Essential for this project since HF is the core data source. Configure at `https://huggingface.co/settings/mcp`. |
| **Figma MCP Server** | Design-to-code pipeline. Outputs structured React + Tailwind from Figma selections. Supports Tauri and Electron as target frameworks. |
| **Playwright MCP Server** | Browser automation for E2E testing. Test the full user flow — browse, generate, run — in headless Chromium. |
| **File System MCP Server** | Advanced file operations for managing model storage, config files, and build outputs. |
| **SQLite MCP Server** | Database management for the local app DB (model cache, code cache, user preferences). |
| **Memory MCP Server** | Persistent context across coding sessions. Knowledge graph for retaining architecture decisions, API patterns, and component conventions. |

### Project Configuration Files

| File | Purpose |
|---|---|
| `AGENTS.md` | Repository-level instructions for AI agents. Document architecture, conventions, file structure, and key decisions so any agentic tool entering the repo has full context. |
| `.cursorrules` / `ai_instructions.md` | Tool-specific rules files defining coding style, framework conventions (React + TypeScript + Tailwind), component patterns, and project-specific constraints. |
| `SKILL.md` files | If using Cursor/AI IDE's skill system, define skills for code generation templates, model metadata parsing, and Python sidecar management. |

---

## Sprint 1: Application Shell & UI Foundation

**Duration:** Weeks 1–2
**Goal:** Tauri desktop app running on Windows with a React frontend, three-panel layout, and Hugging Face model browsing.

### Deliverables

- Tauri project scaffolded with React + TypeScript + Tailwind
- Three-panel layout: Model Browser (left) | Code Editor (center) | Output Panel (right)
- Monaco Editor integrated in center panel (syntax highlighting, basic editing)
- Hugging Face API integration: search, filter, paginate models
- Model detail view: name, author, description, pipeline tag, size, downloads
- Basic navigation: Browse tab, My Models tab (placeholder), Settings tab (placeholder)
- Status bar: RAM display, placeholder for GPU info
- Dark/light theme support
- Responsive panel resizing (draggable splitters)

### Technical Decisions

- **Tauri over Electron.** Smaller binary (~10MB vs ~150MB), lower memory overhead, Rust backend for process management. Tauri v2 supports Windows, macOS, and Linux.
- **Monaco Editor.** Same engine as VS Code. Well-tested in Tauri/Electron apps. Supports TypeScript, Python syntax, inline diagnostics.
- **Zustand for state management.** Lightweight, minimal boilerplate, works well with React concurrent features.

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Figma MCP Server** | Design the three-panel layout in Figma first. Use the MCP server's `get_design_context` tool to extract structured React + Tailwind code directly into Cursor. This produces accurate layout, spacing, and component hierarchy from your design. The server supports Tauri as a target framework. |
| **Figma MCP Pro** (`@artemsvit/figma-mcp-pro`) | Alternative community Figma MCP with explicit Tauri framework support, CSS generation from Figma properties, and batch asset downloads. Useful if the official server doesn't cover all edge cases. |
| **Hugging Face MCP Server** | Use during development to test model search queries, validate API response structures, and understand what metadata fields are actually available vs. documented. Ask your AI assistant: "Search Hugging Face models for text-generation sorted by downloads" to verify your UI handles real data. |
| **Cursor/AI IDE** | Use for Tauri backend setup (Rust sidecar configuration, IPC between frontend and backend, window management). Cursor/AI IDE handles Rust well and can scaffold the Tauri command handlers. |
| **Cursor + Copilot** | Use for all React component development. The tab completions and inline suggestions are fastest for cranking out UI components with Tailwind. |
| **Playwright MCP Server** | Set up E2E test scaffolding from Sprint 1. Write initial tests for: app launches, model search returns results, model detail page renders. |
| **Context7 MCP** | Pulls up-to-date documentation for libraries. Use it to fetch current Tauri v2 docs, Monaco Editor API docs, and Zustand patterns without relying on stale training data. |

### Key References for AI Agents

Add to `AGENTS.md`:
- Tauri v2 IPC pattern: commands defined in `src-tauri/src/main.rs`, invoked from React via `@tauri-apps/api`
- Monaco Editor React wrapper: `@monaco-editor/react`
- HF API base: `https://huggingface.co/api/models` with query params `?search=`, `?pipeline_tag=`, `?sort=downloads`, `?limit=`
- Component naming convention: PascalCase, one component per file, co-located tests

---

## Sprint 2: Python Sidecar & Execution Engine

**Duration:** Weeks 3–4
**Goal:** Managed Python environment, process spawning, code execution with stdout/stderr streaming back to the UI.

### Deliverables

- Bundled Python 3.11+ environment (embedded in app data directory)
- Tauri sidecar configuration for Python process management
- "Run" button in UI that executes Python code from the Monaco editor
- Real-time stdout streaming to Output Panel (line by line)
- stderr streaming to collapsible Error Panel
- Process lifecycle: spawn, monitor, cancel (SIGTERM), cleanup
- Import parser: scan editor code for import statements
- Basic dependency check: compare imports against installed packages
- "Install missing packages" prompt with progress indicator
- Execution state UI: idle → running → complete/error, with elapsed time

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Cursor/AI IDE** | This sprint is heavy on systems work (process management, IPC, streaming). Cursor/AI IDE excels here — use it for the Rust-side sidecar management, subprocess spawning, and stdout piping logic. |
| **File System MCP** | Managing the bundled Python environment, model storage paths, and temp directories. Use to verify file operations work correctly across Windows paths. |
| **SQLite MCP Server** | Set up the local database schema: `models` table (id, name, pipeline_tag, path, last_used), `code_cache` table (model_id, hardware_hash, code, created_at), `dependencies` table. |
| **Playwright MCP** | E2E tests for the full run cycle: paste code → click run → verify output appears in panel. |

### Key Architecture Note

The Python sidecar pattern:
```
Tauri (Rust) → spawns Python subprocess
  → writes code to temp file
  → executes: python temp_script.py
  → pipes stdout/stderr back via Tauri event system
  → React frontend listens for events, updates Output Panel
```

This avoids embedding Python in the app binary. The Python environment lives in `{app_data}/python/` and is managed separately from the installer.

---

## Sprint 3: Cursor/AI IDE Generation & Text Generation Models (LLMs)

**Duration:** Weeks 5–6
**Goal:** hf_auto_runner integration for code generating. Full support for text-generation models, including GGUF quantized LLMs.

### Deliverables

- hf_auto_runner integration: send model card + metadata + system specs → receive generated Python code
- Code appears in Monaco editor with syntax highlighting and comments
- "Regenerate" button for fresh code generation
- Code caching: store generated code per model ID + hardware hash in SQLite
- Fallback: local code templates for text-generation pipeline when hf_auto_runner unavailable
- **GGUF LLM support:** detect GGUF files in model repo, generate code using `llama-cpp-python`
- **Transformers LLM support:** generate code using `transformers` pipeline for `.safetensors` / `.bin` models
- Streaming token output: live typewriter display in Output Panel
- Hardware-aware code generation: CPU vs GPU, float16 vs float32, quantization selection
- Model download manager: download model files from HF with progress bar, pause/resume
- Device detection: RAM, GPU presence (CUDA/Metal), VRAM — passed to the system for code generation

### Pre-installed Python Packages (added to base environment)

- `transformers`
- `torch` (CPU build)
- `llama-cpp-python`
- `huggingface_hub`
- `accelerate`
- `sentencepiece`
- `safetensors`

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Critical this sprint. Use to research model card structures for popular LLMs: what metadata is available, how pipeline_tag maps to actual usage, what file formats are present. Test queries like "Search for GGUF text-generation models" to understand the data your code generation prompt will receive. |
| **Cursor/AI IDE** | Write the hf_auto_runner integration itself. Use Cursor/AI IDE to generate the prompt engineering for the code generation system — meta-level: using the system to write the prompts that the system will use in production. |
| **Memory MCP Server** | Store your prompt engineering iterations. As you refine the code generation prompt, save versions and their output quality in the knowledge graph so you can A/B test approaches across sessions. |
| **Brave Search / Web Search MCP** | Research `llama-cpp-python` API patterns, quantization options, and streaming interfaces. Training data may be stale on these fast-moving libraries. |

### Code Generation Prompt Architecture

The prompt sent to the system should include:
```
System: You are a code generator for a local model testing app.
Generate a complete, self-contained Python script that:
- Downloads and runs the specified model locally
- Includes educational comments explaining each step
- Handles errors gracefully (OOM, missing deps, CUDA unavailable)
- Outputs results to stdout (for text) or saves to specified path (for files)
- Uses streaming where applicable

Context:
- Model ID: {model_id}
- Pipeline type: {pipeline_tag}
- Available formats: {file_formats}
- Model card excerpt: {model_card_truncated}
- User hardware: {ram_gb}GB RAM, GPU: {gpu_info}, VRAM: {vram_gb}GB
- Installed packages: {installed_packages}
```

---

## Sprint 4: Text Classification, Summarization & Embeddings

**Duration:** Weeks 7–8
**Goal:** Extend text model support beyond generation to cover the full NLP pipeline landscape.

### Deliverables

- **Text classification:** input text → label + confidence score(s)
- **Summarization:** input long text → condensed summary
- **Embeddings:** input text → vector output (displayed as array, with dimensionality info)
- **Question answering:** input context + question → answer span
- **Named entity recognition:** input text → highlighted entities
- Output Panel adaptations per pipeline type:
  - Classification: label + horizontal confidence bar chart
  - Summarization: side-by-side input/output
  - Embeddings: vector dimensions, first N values, copy button
  - QA: highlighted answer span in context
  - NER: colour-coded entity tags inline
- Code template library: local fallback templates for each pipeline type
- Batch input support: paste multiple inputs, run sequentially, tabular results

### Additional Python Packages

- `scipy` (for embedding similarity calculations)
- `scikit-learn` (optional, for basic clustering/similarity demos)

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Search for top models per pipeline type to test against: `text-classification`, `summarization`, `fill-mask`, `question-answering`, `token-classification`, `feature-extraction`. Use the metadata to verify your pipeline_tag → template mapping is correct. |
| **Figma MCP Server** | Design the output panel variants for each pipeline type. Each needs a different visualisation — use Figma to design the confidence bars, side-by-side views, entity highlighting, then extract to React via MCP. |
| **Cursor** | Primary tool for building the pipeline-specific output renderers. Each is a React component with specific data expectations — fast iteration with tab completions. |
| **Playwright MCP** | Test each pipeline type end-to-end: select model → generate code → run → verify correct output panel renders. |

---

## Sprint 5: Vision Models (Image Classification, Detection, Segmentation)

**Duration:** Weeks 9–10
**Goal:** Full support for vision models. Users can upload images and run classification, object detection, and segmentation locally.

### Deliverables

- **Image upload UI:** drag-and-drop or file picker in the Input Panel area
- **Image classification:** upload image → label + confidence scores
- **Object detection:** upload image → bounding boxes with labels overlaid on image
- **Image segmentation:** upload image → coloured mask overlay
- **Depth estimation:** upload image → depth map visualisation
- Output Panel: image viewer with overlay support (bounding boxes, masks, labels)
- Image preview in input area with resize/crop info
- Generated code handles image preprocessing (resize, normalize, tensor conversion)
- Support for both ONNX and PyTorch vision models
- Image output file handling: save annotated images to temp dir, display in Output Panel

### Additional Python Packages

- `Pillow`
- `onnxruntime`
- `torchvision`
- `opencv-python-headless`

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Research popular vision models and their specific requirements. Many vision models have non-standard preprocessing. Use: "Find top image-classification models sorted by downloads" and inspect their model cards for code examples. |
| **Figma MCP Server** | Design the image viewer with overlay system — bounding boxes need to scale correctly, masks need opacity controls, labels need positioning. This is a non-trivial UI component worth designing properly. |
| **Cursor/AI IDE** | Generate the Python-side image handling: loading with Pillow, preprocessing tensors, postprocessing bounding boxes/masks back to image coordinates. This involves coordinate math that benefits from the system's reasoning. |
| **File System MCP** | Manage temp image files — uploaded inputs, annotated outputs, intermediate results. Ensure cleanup on session end. |

### Key Technical Challenge

Bounding box and segmentation mask rendering in the Output Panel requires a canvas overlay system. The image viewer component needs to:
- Display the original image at correct aspect ratio
- Overlay SVG or Canvas elements for boxes/masks
- Scale overlays when the panel resizes
- Support toggling individual detection labels on/off

---

## Sprint 6: Audio Models (Speech Recognition & Text-to-Speech)

**Duration:** Weeks 11–12
**Goal:** Full support for audio input and output models. Users can record or upload audio and hear synthesised speech.

### Deliverables

- **Audio upload UI:** drag-and-drop audio files (.wav, .mp3, .flac)
- **Microphone recording:** browser-native MediaRecorder API via Tauri, record directly in-app
- **Speech recognition (ASR):** audio → transcribed text, with timestamps if model supports it
- **Text-to-speech (TTS):** text input → audio file playback
- **Audio classification:** audio → label + confidence
- Output Panel: embedded audio player (waveform visualisation, playback controls)
- Transcript display with optional word-level timestamps
- Generated code handles audio format conversion (ffmpeg if needed)
- Support for Whisper-family models (most popular ASR models on HF)

### Additional Python Packages

- `soundfile`
- `librosa`
- `pydub`
- `ffmpeg-python` (with bundled ffmpeg binary)

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Research audio model landscape. Whisper variants dominate ASR; identify top TTS models (Bark, VITS, SpeechT5). Check which formats they expect and what their output looks like. |
| **Cursor/AI IDE** | Audio processing has many edge cases: sample rate conversion, mono/stereo handling, chunked processing for long audio. Cursor/AI IDE can generate robust audio preprocessing code with proper error handling. |
| **Figma MCP Server** | Design the waveform visualisation component and audio player controls. This is a distinctive UI element that differentiates the app. |
| **Playwright MCP** | E2E testing with audio is tricky. Use Playwright to test the upload flow with fixture audio files. Test transcript rendering and audio playback controls. |

### Key Technical Challenge

Audio models often require specific sample rates (16kHz for Whisper). The generated code must:
- Detect input sample rate
- Resample if necessary (using librosa or ffmpeg)
- Handle both short-form and long-form audio (chunked processing for files > 30s)
- For TTS, save output to WAV and trigger playback in the frontend

---

## Sprint 7: Image Generation (Diffusion Models)

**Duration:** Weeks 13–14
**Goal:** Support Stable Diffusion and similar diffusion models for text-to-image and image-to-image generation.

### Deliverables

- **Text-to-image:** text prompt → generated image(s)
- **Image-to-image:** upload image + text prompt → modified image
- **Inpainting:** upload image + mask + prompt → infilled image
- Progress bar: diffusion step progress streamed from Python to UI
- Image gallery: generate multiple images, display in grid, click to expand
- Generation parameters UI: steps, guidance scale, seed, negative prompt
- Generated code uses `diffusers` library with appropriate scheduler
- Memory-aware: suggest appropriate model variant (fp16/fp32) based on available VRAM
- Save generated images to user-specified output directory

### Additional Python Packages

- `diffusers`
- `xformers` (optional, for memory-efficient attention)

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Diffusion models have complex configurations. Use MCP to inspect model cards for Stable Diffusion variants, understand which schedulers they support, and what their recommended settings are. |
| **Cursor/AI IDE** | Diffusion pipeline code is complex — loading the correct scheduler, enabling attention slicing for low-VRAM GPUs, half-precision casting. Cursor/AI IDE can generate comprehensive code with all the memory optimisation flags. |
| **Figma MCP Server** | Design the image gallery grid, the generation parameters panel (sliders, seed input, negative prompt), and the progress overlay. This is the most visually rich sprint. |
| **Memory MCP Server** | Track which diffusion model configurations work on which hardware profiles. Store successful generation parameters so the code generation prompt can reference them. |

### Key Technical Challenge

Diffusion models are the most resource-intensive category. The code generation must:
- Default to fp16 on CUDA GPUs to halve VRAM usage
- Enable `attention_slicing` and `vae_slicing` for GPUs with <8GB VRAM
- Suggest SDXL-Turbo or LCM variants for users with limited hardware
- Stream step progress: the Python callback `callback_on_step_end` must pipe progress to stdout in a format the frontend can parse

---

## Sprint 8: Multimodal Models (Vision-Language, Document Understanding)

**Duration:** Weeks 15–16
**Goal:** Support models that combine multiple modalities — primarily vision-language models (VLMs) for visual question answering, image captioning, and document understanding.

### Deliverables

- **Visual question answering:** upload image + text question → text answer
- **Image captioning:** upload image → descriptive text
- **Document understanding:** upload document image/PDF → structured extraction
- **Video understanding:** upload short video clip → description (if model supports it)
- Combined input UI: image upload + text input side by side
- Output Panel: answer text with reference to input image
- Support for popular VLMs: LLaVA, InternVL, Qwen-VL, Florence
- Multi-turn conversation support for chat-based VLMs
- Generated code handles image+text input encoding for various architectures

### Additional Python Packages

- `pdf2image` (for document models)
- `av` or `decord` (for video frame extraction)

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | VLM architectures vary significantly. Use MCP to inspect model cards for LLaVA, InternVL, Qwen-VL families. Understand their input format requirements — some expect chat-style messages, others expect separate image/text inputs. |
| **Cursor/AI IDE** | Multi-turn VLM conversation logic is complex. The generated code needs to manage conversation history, image context, and model-specific formatting. Cursor/AI IDE's large context window helps here. |
| **Figma MCP Server** | Design the dual-input interface: image preview + text input + conversation history. This is a new layout pattern distinct from single-input sprints. |

### Key Technical Challenge

VLMs have the most fragmented interface landscape:
- LLaVA-style: special `<image>` tokens in the prompt
- Qwen-VL: specific message format with image URLs
- Florence: task-prefix prompts (`<CAPTION>`, `<OD>`, etc.)

The code generation prompt must understand each architecture family and produce the correct input formatting. This is where the system reading the model card becomes most valuable — the model card usually shows the exact input format.

---

## Sprint 9: ONNX Runtime, Model Format Handling & Performance

**Duration:** Weeks 17–18
**Goal:** Robust ONNX Runtime support, automatic format detection, GPU acceleration, and performance monitoring.

### Deliverables

- **ONNX Runtime integration:** detect ONNX models, generate optimised ONNX inference code
- **Format detection:** automatically identify available formats per model (PyTorch, ONNX, GGUF, SafeTensors) and choose the best one for the user's hardware
- **GPU acceleration:** CUDA support on Windows/Linux, ROCm detection, Vulkan fallback
- **Performance dashboard:** tokens/sec for LLMs, inference time for other models, memory usage tracking
- **Model format recommendation:** "This model is available in ONNX which runs 2x faster on your hardware"
- **Quantization guidance:** when multiple quantisation levels are available (Q4, Q5, Q8), recommend based on RAM
- Real-time memory monitor in status bar (updates during inference)
- Graceful OOM handling: catch memory errors, suggest smaller model or quantisation

### Additional Python Packages

- `onnxruntime-gpu` (conditional install based on GPU detection)
- `optimum` (Hugging Face's ONNX optimisation library)
- `psutil` (system monitoring)

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Hugging Face MCP Server** | Research which popular models have ONNX variants. Many models have community-contributed ONNX conversions. Use MCP to find these and test compatibility. |
| **Cursor/AI IDE** | GPU detection logic (CUDA version, driver compatibility, VRAM measurement) and ONNX Runtime provider configuration are systems-level work. Cursor/AI IDE handles this well. |
| **Brave Search / Web Search MCP** | Research ONNX Runtime execution providers, CUDA toolkit compatibility matrices, and quantisation performance benchmarks. This information changes frequently. |
| **SQLite MCP Server** | Extend the database with a `benchmarks` table to store performance results per model per hardware configuration. This data can inform future code generation. |

---

## Sprint 10: Cross-Platform, Polish & Launch Readiness

**Duration:** Weeks 19–20
**Goal:** macOS and Linux builds, installer packaging, onboarding flow, error recovery, and launch polish.

### Deliverables

- **macOS build:** Tauri macOS target, Metal GPU detection, CoreML awareness
- **Linux build:** Tauri Linux target, CUDA/ROCm detection, AppImage packaging
- **Installer experience:** clean install flow, Python environment setup with progress
- **Onboarding:** first-launch wizard (detect hardware, set model storage directory, optional HF token)
- **Settings panel:** model storage path, theme, hf_auto_runner key, HF token, default parameters
- **Error recovery:** automatic retry on transient failures, clear error messages with suggested fixes
- **Offline mode:** fallback templates when hf_auto_runner unreachable, cached model metadata
- **Update system:** app update checks, model metadata refresh
- **Analytics foundation:** opt-in usage tracking (what pipeline types are used, success rates)
- **Documentation:** README, user guide, FAQ, troubleshooting

### Agentic AI Tooling for This Sprint

| Tool / MCP | How to Use It |
|---|---|
| **Cursor/AI IDE** | Platform-specific Rust code for macOS (Metal detection, DMG packaging) and Linux (AppImage, GPU driver detection). Cursor/AI IDE handles Rust and cross-platform conditionals well. |
| **GitHub MCP Server** | Release management: create release tags, upload build artifacts, manage changelogs. Automate the release pipeline through MCP. |
| **Playwright MCP Server** | Full regression E2E test suite across all pipeline types. Run on all three platforms. |
| **Figma MCP Server** | Final polish pass: onboarding screens, settings panel, error states, empty states. Design these in Figma and extract to code. |
| **Sentry MCP Server** | Set up error tracking for production. Configure Sentry MCP to monitor crash reports and error patterns from real users. |

---

## Sprint Summary Timeline

```
Week  1-2   Sprint 1   App Shell & UI Foundation
Week  3-4   Sprint 2   Python Sidecar & Execution Engine
Week  5-6   Sprint 3   Cursor/AI IDE Generation & LLMs
Week  7-8   Sprint 4   Text Classification, Summarization & Embeddings
Week  9-10  Sprint 5   Vision Models
Week 11-12  Sprint 6   Audio Models
Week 13-14  Sprint 7   Image Generation (Diffusion)
Week 15-16  Sprint 8   Multimodal Models (VLMs)
Week 17-18  Sprint 9   ONNX Runtime, Format Handling & Performance
Week 19-20  Sprint 10  Cross-Platform, Polish & Launch
```

---

## Model Coverage by Sprint Completion

| Sprint | Pipeline Types Supported | Cumulative HF Coverage (est.) |
|---|---|---|
| 3 | text-generation | ~25% |
| 4 | + text-classification, summarization, feature-extraction, question-answering, token-classification, fill-mask | ~55% |
| 5 | + image-classification, object-detection, image-segmentation, depth-estimation | ~65% |
| 6 | + automatic-speech-recognition, text-to-speech, audio-classification | ~72% |
| 7 | + text-to-image, image-to-image | ~80% |
| 8 | + visual-question-answering, image-to-text, document-question-answering | ~85% |
| 9 | + ONNX-optimised versions of all above | ~90% |

---

## Agentic AI Tool Summary Matrix

This table shows which MCP servers and tools are most critical per sprint.

| Sprint | Figma MCP | HF MCP | Cursor/AI IDE | Cursor | Playwright | GitHub MCP | SQLite MCP | Memory MCP |
|---|---|---|---|---|---|---|---|---|
| 1 - UI Shell | **Critical** | High | High | **Critical** | Medium | Medium | Low | Low |
| 2 - Sidecar | Low | Low | **Critical** | Medium | High | Medium | **Critical** | Low |
| 3 - LLMs | Medium | **Critical** | **Critical** | Medium | High | Medium | High | **Critical** |
| 4 - NLP | Medium | **Critical** | High | **Critical** | High | Medium | Medium | Medium |
| 5 - Vision | **Critical** | **Critical** | High | High | High | Medium | Medium | Medium |
| 6 - Audio | **Critical** | High | **Critical** | High | Medium | Medium | Medium | Medium |
| 7 - Diffusion | **Critical** | High | **Critical** | High | Medium | Medium | Medium | High |
| 8 - Multimodal | High | **Critical** | **Critical** | High | Medium | Medium | Medium | High |
| 9 - ONNX/Perf | Low | High | **Critical** | Medium | High | Medium | **Critical** | High |
| 10 - Launch | High | Medium | **Critical** | High | **Critical** | **Critical** | Medium | Medium |

---

## Additional MCP Servers to Consider

These are optional but can significantly accelerate specific tasks:

| MCP Server | When to Use |
|---|---|
| **Supabase MCP** | If you move from SQLite to a hosted backend for user accounts or shared model ratings. |
| **Vercel MCP** | If you build a web version (Phase 4 from the PRD) and want AI-assisted deployment. |
| **Docker MCP** | For containerised Python environment management — alternative to bundled Python. |
| **Linear / Notion MCP** | Project management integration if working with a team. |
| **Sentry MCP** | Error tracking in production. Configure in Sprint 10. |
| **Context7 MCP** | Pulls current library documentation. Useful throughout, especially for fast-moving libraries like Transformers, Diffusers, and llama-cpp-python. |
| **Firecrawl MCP** | Web scraping for pulling model documentation, blog posts about model usage, and benchmark data that isn't in the HF API. |

---

## Spec-Driven Development Recommendation

Based on the GitHub Spec Kit approach, each sprint should follow this workflow:

1. **Write the spec first.** Define inputs, outputs, components, and API contracts in a markdown spec before writing code.
2. **Give the spec to your AI agent.** Cursor/AI IDE or Cursor reads the spec and generates implementation aligned with the contract.
3. **Use the spec for testing.** E2E tests validate against the spec, not just the code.
4. **Update the spec when requirements change.** The spec is the source of truth, not the implementation.

This pairs naturally with `AGENTS.md` — together they give any AI agent entering the codebase full context on architecture decisions, coding conventions, and current sprint scope.

---

## Risk Register (Sprint-Level)

| Sprint | Key Risk | Mitigation |
|---|---|---|
| 1 | Tauri v2 React integration issues | Fall back to Electron if blocking. Both support Monaco and Python sidecars. |
| 2 | Python packaging size bloats installer | Ship CPU-only PyTorch initially (~800MB). GPU support as optional download. |
| 3 | the system generates incorrect code for edge-case models | Code is visible and editable. Maintain a "known-good" test suite of 20 popular models. |
| 4 | Too many pipeline type variants to template | Focus on the 5 most popular, use the system generation for the rest. |
| 5 | Vision model preprocessing varies wildly | Lean on the system reading the model card. Include `torchvision.transforms` in generated code. |
| 6 | Audio format handling is fragile | Bundle ffmpeg. Always convert to WAV 16kHz before inference. |
| 7 | Diffusion models exceed user VRAM | Default to fp16 + attention slicing. Recommend smaller models for <8GB VRAM. |
| 8 | VLM architectures too fragmented | Support top 3 families (LLaVA, Qwen-VL, Florence) first. Add others post-launch. |
| 9 | ONNX conversion failures | Only support models that already ship ONNX weights. Do not attempt runtime conversion. |
| 10 | macOS/Linux packaging breaks | CI/CD pipeline builds and tests on all 3 platforms from Sprint 10 day one. |
