# HuggingBox

HuggingBox is a Tauri desktop app for browsing Hugging Face models, generating local inference code, and running those models on your own machine.

It combines:
- a Hugging Face model browser
- per-model Python environments
- editable generated code
- a file explorer + editor workspace
- local execution with live logs
- runtime routing across `transformers`, `llama.cpp`, `diffusers`, multimodal, audio, and ONNX paths

## Download

Prebuilt releases are available here:

- [Download HuggingBox](https://github.com/Schwaemo/huggingbox/releases)

If there is no release yet for your platform, build it locally using the instructions below.

## What It Does

HuggingBox is designed as a local model workbench rather than a simple model launcher.

You can:
- browse models from `huggingface.co`
- inspect model details, size, format, and hardware fit
- generate starter inference code
- edit the code directly in the built-in workspace
- run the visible editor file inside the selected model environment
- inspect stdout, stderr, and structured outputs
- manage model files and Python environments per model

Supported capability areas in the current codebase include:
- text generation and common NLP pipelines
- vision pipelines
- audio pipelines
- diffusion image generation
- multimodal/image-document understanding
- ONNX runtime for supported same-repo ONNX models

## Stack

- Tauri 2
- React 19
- TypeScript
- Zustand
- Rust
- Python model runtimes

## Project Structure

```text
src/                 React UI, hooks, services, Zustand store
src-tauri/           Rust backend, Tauri commands, bundling config
hf_auto_runner/      Python runtime/router/script generation logic
docs/                PRD, design spec, sprint plan
```

## Requirements

For Windows development:

- Node.js 18+
- Rust toolchain
- Tauri prerequisites
- Python 3.11+
- WebView2 runtime

You will also want:
- a Hugging Face token for gated/private models
- an Anthropic API key if you want to use Claude Sonnet code generation (recommended)

## Development

Install dependencies:

```powershell
npm install
```

Run the desktop app in development mode:

```powershell
npm run tauri dev
```

## Build

Validate the app first:

```powershell
cmd /c npx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
python -m py_compile hf_auto_runner/script_generator.py hf_auto_runner/runtime_router.py hf_auto_runner/dependency_manager.py
```

Create a production build:

```powershell
npm run tauri build
```

Build artifacts will be placed under:

- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

## Current Platform Status

- Windows: primary supported development/build target
- Linux: feasible, but still requires cross-platform hardening/testing
- macOS: planned, but not a trivial build target from Windows

## Runtime Notes

HuggingBox does not run a single fixed backend. It routes models into the most appropriate local runtime based on format, architecture, and pipeline.

Examples:
- GGUF LLMs -> `llama.cpp`
- supported ONNX models -> `onnxruntime`
- diffusion models -> `diffusers`
- multimodal document/image models -> multimodal transformers path
- audio models -> audio transformers path

Execution runs the code currently visible in the editor, not a hidden internal script.

## Settings and Environments

HuggingBox creates isolated Python environments per model by default. On first run, it can:

- install download/runtime dependencies
- download model files
- run compatibility/dependency probes

After first run, dependency management is intentionally more manual so users can control the environment through the built-in terminal.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

Important:
- This license covers the HuggingBox application code in this repository.
- A [NOTICE](NOTICE) file is included for attribution handling in downstream redistributions.
- Hugging Face models, downloaded weights, and third-party runtime dependencies may be licensed separately.
- Always check the license terms for any model or dependency you use or redistribute.
