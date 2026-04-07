# Upgrade Plan 1 — Windows Hardware Parity

**Source spec:** `docs/upgrades.md`  
**Owner hardware:** NVIDIA + AMD discrete GPUs

---

## Current Baseline (what the code does today)

| Component | Current State |
|---|---|
| `lib.rs` `detect_gpu_windows()` | Returns `(gpu_name, vram_bytes)` — no vendor classification |
| `SystemInfoPayload` | Has `gpu_name` + `gpu_vram` — **no `gpu_vendor` field** |
| `dependency_manager.py` | Fully static — always installs vanilla `torch`, no CUDA index URL |
| `script_generator.py` `_llama_cpp_template()` | `n_gpu_layers` not set → defaults to 0 → **all inference runs on CPU** |
| `cli.py` | Never reads or sets `HB_GPU_BACKEND`; never forwards vendor to Python |
| `script_generator.py` PyTorch templates | No DirectML device injection |

---

## Sprint 1 — Immediate GPU Unlock (P0 Quick Wins)

**Scope:** Two self-contained fixes that together move NVIDIA users from CPU-only to full GPU inference with no architectural changes. Each fix is under 30 lines.

### 1.1 — Fix `n_gpu_layers` in `_llama_cpp_template()`

**File:** `hf_auto_runner/script_generator.py`

Change the `Llama(...)` constructor call from:

```python
llm = Llama(model_path=model_path, n_ctx=2048)
```

to:

```python
llm = Llama(model_path=model_path, n_gpu_layers=-1, n_ctx=4096, verbose=False)
```

`n_gpu_layers=-1` tells llama.cpp to push every transformer layer onto the GPU (CUDA or Vulkan, determined by the wheel that is installed). Without this flag the default is `0`, meaning every forward pass runs on the CPU regardless of what GPU is present.

### 1.2 — Install the CUDA wheel in `DependencyManager`

**File:** `hf_auto_runner/dependency_manager.py`

When `runtime == "llama_cpp"`, replace the bare `pip install llama-cpp-python` with the pre-built CUDA wheel from the official GitHub releases:

```python
subprocess.run([
    python_exec, "-m", "pip", "install",
    "llama-cpp-python",
    "--extra-index-url",
    "https://abetlen.github.io/llama-cpp-python/whl/cu121",
], check=True)
```

For the standard `torch` runtimes, append the CUDA index URL so the CUDA-linked wheel is pulled:

```python
subprocess.run([
    python_exec, "-m", "pip", "install",
    "torch", "torchvision", "torchaudio",
    "--index-url", "https://download.pytorch.org/whl/cu121",
], check=True)
```

At this stage no GPU-vendor detection is required — the CUDA wheel is a superset of the CPU wheel and installs cleanly on any machine even if no NVIDIA GPU is present (it just won't use CUDA).

---

### Sprint 1 — Deliverables

- `n_gpu_layers=-1` in the llama_cpp script template
- CUDA wheel URL used for `llama-cpp-python` installs
- CUDA index URL used for `torch` installs

---

### Sprint 1 — Test Checklist

**NVIDIA machine**

1. Open HuggingBox, search for `bartowski/Llama-3.2-3B-Instruct-GGUF` and click Run.
2. Watch the output panel during dependency install. Confirm the log shows a `cu121` URL in the pip output (or that `llama-cpp-python` installs without an error).
3. After the model loads, the first output line should read:  
   `[HuggingBox] Backend: llama.cpp / CUDA` (or equivalent — whatever label you add)
4. Open **Task Manager → Performance → GPU** while inference runs. GPU utilisation should climb above 0%. CPU-only inference pegs CPU utilisation and leaves GPU at idle.
5. Inference should complete noticeably faster than before — a 3B Q4_K_M model should produce the first token in under 2 seconds on an RTX card.

**AMD machine**

1. Run the same model on your AMD GPU.
2. Because no Vulkan wheel is installed yet (Sprint 2), llama.cpp will fall back to CPU. Confirm it still completes without crashing — the CUDA wheel installs cleanly on non-NVIDIA machines, it just does not activate CUDA.
3. Watch CPU utilisation — it should be at ~100% on one core (CPU inference), not GPU.

---

## Sprint 2 — GPU Vendor Detection Pipeline (P1 Infrastructure)

**Scope:** Wire the GPU vendor from the Windows registry (Rust) through the Tauri IPC to the Python subprocess as `HB_GPU_BACKEND`. Every conditional behaviour in Sprints 3–5 depends on this env var being present.

### 2.1 — Add `GpuVendor` and `gpu_vendor` to Rust

**File:** `src-tauri/src/lib.rs`

Add the enum and classify the GPU name string returned by `detect_gpu_windows()`:

```rust
#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Unknown,
}

fn classify_vendor(name: &str) -> GpuVendor {
    let lower = name.to_lowercase();
    if lower.contains("nvidia") || lower.contains("geforce") || lower.contains("rtx") || lower.contains("gtx") {
        GpuVendor::Nvidia
    } else if lower.contains("amd") || lower.contains("radeon") || lower.contains("rx ") {
        GpuVendor::Amd
    } else if lower.contains("intel") || lower.contains("arc") || lower.contains("iris") || lower.contains("uhd") {
        GpuVendor::Intel
    } else {
        GpuVendor::Unknown
    }
}
```

Expand `SystemInfoPayload`:

```rust
pub struct SystemInfoPayload {
    total_ram: u64,
    available_ram: u64,
    gpu_name: Option<String>,
    gpu_vram: Option<u64>,
    gpu_vendor: Option<GpuVendor>,   // new
    os_name: String,
}
```

Populate `gpu_vendor` inside the `get_system_info` command:

```rust
let vendor = gpu.as_ref().map(|g| classify_vendor(&g.0));

SystemInfoPayload {
    gpu_name: gpu.as_ref().map(|g| g.0.clone()),
    gpu_vram: gpu.as_ref().map(|g| g.1),
    gpu_vendor: vendor,
    ...
}
```

### 2.2 — Set `HB_GPU_BACKEND` when spawning the Python subprocess

**File:** `src-tauri/src/lib.rs` — wherever `tokio::process::Command` is built to launch `hf_auto_runner`

```rust
let backend = match gpu_vendor {
    Some(GpuVendor::Nvidia)  => "cuda",
    Some(GpuVendor::Amd)     => "amd",
    Some(GpuVendor::Intel)   => "intel",
    _                        => "cpu",
};

command.env("HB_GPU_BACKEND", backend);
```

### 2.3 — Thread `gpu_vendor` through `cli.py`

**File:** `hf_auto_runner/cli.py`

Read `HB_GPU_BACKEND` from the environment and pass it downstream:

```python
gpu_backend = os.environ.get("HB_GPU_BACKEND", "cpu").strip().lower()

dep_manager = DependencyManager(python_exec, runtime, gpu_backend=gpu_backend)
script_gen  = ScriptGenerator(model_id, metadata, runtime, architecture,
                               gpu_backend=gpu_backend,
                               gpu_vram_bytes=...)   # forwarded from SystemInfoPayload
```

`DependencyManager.__init__` and `ScriptGenerator.__init__` both receive `gpu_backend` as a new keyword argument (defaulting to `"cpu"` for backwards compatibility).

---

### Sprint 2 — Deliverables

- `GpuVendor` enum in Rust with name-string classifier
- `gpu_vendor` field in `SystemInfoPayload`
- `HB_GPU_BACKEND` env var set on every Python subprocess launch
- `cli.py` reads `HB_GPU_BACKEND` and passes it to `DependencyManager` and `ScriptGenerator`

---

### Sprint 2 — Test Checklist

**Both machines**

1. Add a temporary debug print to `cli.py`:  
   `print(f"[DEBUG] HB_GPU_BACKEND={gpu_backend}", flush=True)`
2. Run any model from HuggingBox and check the output panel.
3. **NVIDIA machine:** Output panel should show `HB_GPU_BACKEND=cuda`
4. **AMD machine:** Output panel should show `HB_GPU_BACKEND=amd`
5. Open the browser DevTools console (if the status bar exposes system info) or add a temporary `console.log` on the `SystemInfoPayload` from `get_system_info`. Confirm `gpu_vendor` is `"nvidia"` / `"amd"` respectively.
6. Remove the debug print before committing.

---

## Sprint 3 — Hardware-Aware Dependency Management & GGUF Quant Selection (P1)

**Scope:** `DependencyManager` installs the correct wheel for each hardware path. `ScriptGenerator` picks the best GGUF quantisation that fits in available VRAM.

### 3.1 — Vulkan wheel for `llama-cpp-python` on AMD

**File:** `hf_auto_runner/dependency_manager.py`

```python
def _install_llama_cpp(self):
    if self.gpu_backend == "cuda":
        subprocess.run([
            self.python_exec, "-m", "pip", "install", "llama-cpp-python",
            "--extra-index-url",
            "https://abetlen.github.io/llama-cpp-python/whl/cu121",
        ], check=True)
    elif self.gpu_backend in ("amd", "intel"):
        # Try pre-built Vulkan wheel; fall back to source compilation
        try:
            subprocess.run([
                self.python_exec, "-m", "pip", "install", "llama-cpp-python",
                "--extra-index-url",
                "https://github.com/abetlen/llama-cpp-python/releases/expanded_assets/latest",
            ], check=True)
        except subprocess.CalledProcessError:
            env = os.environ.copy()
            env["CMAKE_ARGS"] = "-DGGML_VULKAN=on"
            env["FORCE_CMAKE"] = "1"
            subprocess.run([
                self.python_exec, "-m", "pip", "install",
                "llama-cpp-python", "--no-binary", "llama-cpp-python",
            ], check=True, env=env)
    else:
        subprocess.run([
            self.python_exec, "-m", "pip", "install", "llama-cpp-python",
        ], check=True)
```

### 3.2 — Vulkan wheel for `stable-diffusion-cpp-python` on AMD

```python
elif self.gpu_backend in ("amd", "intel") and self.runtime == "diffusers":
    env = os.environ.copy()
    env["CMAKE_ARGS"] = "-DSD_VULKAN=ON"
    subprocess.run([
        self.python_exec, "-m", "pip", "install",
        "stable-diffusion-cpp-python", "--no-binary", "stable-diffusion-cpp-python",
        "huggingface_hub", "pillow",
    ], check=True, env=env)
```

### 3.3 — DirectML swap for PyTorch pipelines on AMD/Intel

When the runtime uses PyTorch (`diffusers`, `transformers_*`) and `gpu_backend` is `amd` or `intel`, strip the standard `torch` family and replace with `torch-directml`:

```python
if self.gpu_backend in ("amd", "intel") and self.runtime in (
    "diffusers", "transformers_audio", "transformers_multimodal",
    "transformers_llm", "transformers_generic",
):
    deps = [d for d in deps if d not in ("torch", "torchvision", "torchaudio")]
    deps.append("torch-directml")
```

### 3.4 — `onnxruntime-directml` swap

```python
if self.gpu_backend != "cuda" and "onnxruntime" in deps:
    deps = [d for d in deps if d != "onnxruntime"]
    deps.append("onnxruntime-directml")
```

### 3.5 — Smart GGUF quantisation selection

**File:** `hf_auto_runner/script_generator.py`

Add a `pick_gguf()` helper and call it from `_llama_cpp_template()`. The quant priority table mirrors LM Studio's logic:

```python
QUANT_PRIORITY = [
    (17_000_000_000, "Q8_0"),
    (12_000_000_000, "Q6_K"),
    ( 8_000_000_000, "Q5_K_M"),
    ( 5_000_000_000, "Q4_K_M"),
    ( 3_500_000_000, "Q3_K_M"),
    (             0, "Q2_K"),
]

def pick_gguf(filenames: list[str], vram_bytes: int) -> str | None:
    gguf_files = [f for f in filenames if f.endswith(".gguf")]
    if not gguf_files:
        return None
    for vram_min, substr in QUANT_PRIORITY:
        if vram_bytes >= vram_min:
            match = next((f for f in gguf_files if substr.lower() in f.lower()), None)
            if match:
                return match
    return sorted(gguf_files)[0]
```

`ScriptGenerator.__init__` now also accepts `gpu_vram_bytes: int = 0` and uses it inside `_llama_cpp_template()` to inject the chosen filename instead of `next(f for f in filenames if f.endswith(".gguf"), None)`.

---

### Sprint 3 — Deliverables

- `DependencyManager` installs the correct `llama-cpp-python` wheel per vendor
- `DependencyManager` swaps `torch` → `torch-directml` on AMD/Intel PyTorch runtimes
- `DependencyManager` swaps `onnxruntime` → `onnxruntime-directml` on non-CUDA
- `DependencyManager` installs `stable-diffusion-cpp-python` with Vulkan for AMD/Intel diffusion
- `ScriptGenerator` selects the best GGUF quantisation that fits in detected VRAM

---

### Sprint 3 — Test Checklist

**AMD machine — llama.cpp via Vulkan**

1. Run `bartowski/Llama-3.2-3B-Instruct-GGUF` (or any GGUF model) from HuggingBox.
2. During dependency install, confirm the output panel shows `llama-cpp-python` installing without the `cu121` index URL — it should install via the Vulkan path.
3. After install, run the model. Open **Task Manager → Performance → GPU** (AMD GPU tab). GPU utilisation should rise above 0% during inference. If you have AMD Software: Adrenalin Edition, the "GPU Engine" counter will also show activity.
4. Run the same GGUF model on your NVIDIA machine. It should still use CUDA (the `cu121` wheel). Both machines should show GPU activity.

**AMD machine — GGUF quant selection**

5. Load a model repo that contains multiple GGUF quants (e.g., `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`). In the output panel observe which file is selected and confirm it matches the VRAM headroom. For example, on a card with 8 GB VRAM the selected file should contain `Q5_K_M` or `Q4_K_M` in its filename.

**AMD machine — diffusers / DirectML**

6. Run a text-to-image model (e.g., `runwayml/stable-diffusion-v1-5`). During dependency install, confirm the output panel does **not** show standard `torch` being installed; instead `torch-directml` should appear.
7. The inference script should complete without a CUDA-not-found error.

---

## Sprint 4 — Streaming Output, Flash Attention & KV Cache (P2)

**Scope:** UX parity with LM Studio. Real-time token streaming with a tokens-per-second counter, flash attention on NVIDIA Ampere/Ada cards, and KV cache quantisation to stretch VRAM on long contexts.

### 4.1 — Streaming output with TPS counter

**File:** `hf_auto_runner/script_generator.py` — `_llama_cpp_template()`

Replace the blocking `output = llm(prompt, max_tokens=128, echo=True)` with a streaming loop:

```python
import time

print(f"[HuggingBox] Loaded model in {load_elapsed:.1f}s", flush=True)
print(f"[HuggingBox] Backend: {backend_label}", flush=True)

start = time.perf_counter()
token_count = 0

for chunk in llm(prompt, max_tokens=512, stream=True):
    token = chunk["choices"][0]["text"]
    print(token, end="", flush=True)
    token_count += 1

elapsed = max(time.perf_counter() - start, 1e-9)
tps = token_count / elapsed
print(f"\n\n[HuggingBox] {token_count} tokens · {elapsed:.1f}s · {tps:.1f} tok/s", flush=True)
```

The `flush=True` is critical — Tauri reads the subprocess stdout line-by-line and the output panel only updates when a newline is flushed.

### 4.2 — Flash attention on NVIDIA

**File:** `hf_auto_runner/script_generator.py` — `_llama_cpp_template()`

```python
flash_attn = (gpu_backend == "cuda")   # gpu_backend injected from self.gpu_backend

llm = Llama(
    model_path=model_path,
    n_gpu_layers=-1,
    n_ctx=4096,
    flash_attn=flash_attn,
    type_k=8,
    type_v=8,
    verbose=False,
)
```

`flash_attn=True` is safe on Ampere (RTX 3000) and Ada Lovelace (RTX 4000). It halves VRAM usage for long contexts and provides a 15–25% throughput improvement. It must remain `False` on Vulkan (AMD) — the Vulkan backend does not implement flash attention yet.

### 4.3 — KV cache quantisation

`type_k=8, type_v=8` (shown above) stores the KV cache in Q8_0 format rather than FP16. This saves approximately 40% of KV VRAM at a 4 k context window with negligible quality loss. It is safe on both CUDA and Vulkan backends.

### 4.4 — VRAM-aware `n_gpu_layers` (partial offload)

**File:** `hf_auto_runner/script_generator.py`

Add a layer-count estimator. This is used when `gpu_vram_bytes` is insufficient for full offload:

```python
def _calc_gpu_layers(param_billions: float, vram_bytes: int, quant_bits: int = 4) -> int:
    if vram_bytes <= 0:
        return 0
    usable = vram_bytes * 0.90
    model_bytes = param_billions * 1e9 * (quant_bits / 8)
    if usable >= model_bytes:
        return -1
    num_layers = 32  # 7B baseline; refined once config.json is parsed
    bytes_per_layer = model_bytes / num_layers
    return max(1, int(usable / bytes_per_layer))
```

In `_llama_cpp_template()`, replace the hard-coded `-1`:

```python
n_gpu_layers = _calc_gpu_layers(
    param_billions=self.metadata.get("num_params_billion", 7.0),
    vram_bytes=self.gpu_vram_bytes,
)
llm = Llama(model_path=model_path, n_gpu_layers=n_gpu_layers, ...)
```

---

### Sprint 4 — Deliverables

- Streaming token output in `_llama_cpp_template()` with flush-per-token
- TPS summary line printed after generation completes
- `flash_attn=True` when `gpu_backend == "cuda"`
- KV cache quantisation (`type_k=8, type_v=8`) on all backends
- VRAM-aware partial offload replacing the hard-coded `-1`

---

### Sprint 4 — Test Checklist

**NVIDIA machine — streaming & TPS**

1. Run any GGUF model. The output panel should show tokens appearing **one at a time** as they are generated, not as a single block after the run completes.
2. After generation, the last line of the output panel should read something like:  
   `[HuggingBox] 156 tokens · 4.2s · 37.1 tok/s`
3. Confirm the `tok/s` figure is plausible for your GPU. RTX 3060 should achieve 30–60 tok/s on a Q4_K_M 3B model. RTX 4080 should achieve 80–120 tok/s.

**NVIDIA machine — flash attention**

4. Run a GGUF model with `n_ctx=4096`. Check Task Manager GPU memory. With `flash_attn=True` the VRAM usage should be lower than without it. If you had previously measured it (Sprint 1 baseline), compare the numbers.

**AMD machine — streaming & TPS (Vulkan)**

5. Run the same GGUF model. Tokens should stream in the output panel.
6. Confirm the `tok/s` figure. An RX 6800 XT should achieve 20–40 tok/s on Q4_K_M 3B via Vulkan. If the number is below 5 tok/s, the Vulkan wheel likely did not activate — re-check the installation log from Sprint 3.

**Both machines — partial offload**

7. Find a GGUF model where the total size exceeds your VRAM (e.g., a Q4_K_M 70B model file on a 12 GB GPU). Run it. Confirm the app does not crash with OOM. Instead, `n_gpu_layers` should be a partial number (e.g., 18 out of 80 layers), and inference should proceed slowly but successfully using both GPU and CPU.

---

## Sprint 5 — DirectML for PyTorch Pipelines (P3)

**Scope:** AMD and Intel users get GPU acceleration for diffusion, audio (Whisper), vision, and multimodal models that cannot use the llama.cpp or stable-diffusion-cpp-python C++ backends.

### 5.1 — DirectML device injection in all PyTorch templates

**File:** `hf_auto_runner/script_generator.py`

For `_diffusers_template()`, `_audio_template()`, `_multimodal_template()`, `_llm_template()`, and `_generic_template()`, replace the current CUDA device selection block with:

```python
import torch

if torch.cuda.is_available():
    device = "cuda"
else:
    try:
        import torch_directml
        device = torch_directml.device()   # returns a device object, not a string
    except ImportError:
        device = "cpu"

print(f"[HuggingBox] Device: {device}", flush=True)
```

All downstream `.to(device)` calls already work with this pattern because `torch_directml.device()` returns an object implementing the same interface as `torch.device`.

**Important:** Do NOT convert the DirectML device to a string before passing to `.to()`. The string representation `"privateuseone"` is not understood by older versions of `torch-directml`. Pass the object directly.

### 5.2 — stable-diffusion-cpp-python script template

**File:** `hf_auto_runner/script_generator.py`

Add a new `_sd_cpp_template()` method for AMD/Intel diffusion, invoked when `gpu_backend in ("amd", "intel")` and `runtime == "diffusers"`:

```python
def _sd_cpp_template(self) -> str:
    return self._metadata_header() + f"""
from stable_diffusion_cpp import StableDiffusion
from huggingface_hub import hf_hub_download
import os

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None

print("[HuggingBox] Downloading model weights...", flush=True)
model_path = hf_hub_download(repo_id=model_id, filename="...", token=hf_token)

print("[HuggingBox] Backend: stable-diffusion-cpp / Vulkan", flush=True)
sd = StableDiffusion(model_path=model_path)

prompt = os.environ.get("HB_INPUT", "A majestic cat riding a skateboard")
output = sd.generate_image(prompt=prompt, width=512, height=512, sample_steps=20)
output[0].save("output.png")
print("[HuggingBox] Saved output.png", flush=True)
"""
```

Route to this template from `_get_template()`:

```python
if self.runtime == "diffusers" and self.gpu_backend in ("amd", "intel"):
    return self._sd_cpp_template()
```

### 5.3 — User hint for large non-GGUF LLMs on AMD

For `transformers_llm` runtime on AMD, append a hint to the output panel via the generated script:

```python
if gpu_backend == "amd":
    print(
        "[HuggingBox] Note: Large safetensor models (7B+) on AMD may run slowly with DirectML. "
        "Consider using a GGUF variant of this model for better performance.",
        flush=True,
    )
```

---

### Sprint 5 — Deliverables

- DirectML device block in all five PyTorch script templates
- `_sd_cpp_template()` for AMD/Intel diffusion via `stable-diffusion-cpp-python`
- Routing logic in `_get_template()` to select `_sd_cpp_template()` on AMD/Intel diffusion
- Advisory message for large non-GGUF LLMs on AMD

---

### Sprint 5 — Test Checklist

**AMD machine — Whisper / audio via DirectML**

1. Run `openai/whisper-base` with an audio file as `HB_INPUT`.
2. The output panel first line should read `[HuggingBox] Device: privateuseone` (the DirectML device string representation) or similar.
3. GPU utilisation should rise in AMD Software during transcription.
4. Transcription output should be readable text — if it produces garbage, DirectML is likely active but the model is mishandled. Check the `.to(device)` call.

**AMD machine — Stable Diffusion via Vulkan C++**

5. Run `runwayml/stable-diffusion-v1-5` or `stabilityai/stable-diffusion-2-1`.
6. The output panel should show `[HuggingBox] Backend: stable-diffusion-cpp / Vulkan`.
7. An `output.png` file should appear in the model's venv directory.
8. GPU memory usage in AMD Software should spike during generation.
9. Confirm the image is not blank or fully corrupted (minor artefacts are acceptable; fully black or white means the pipeline failed silently).

**NVIDIA machine — PyTorch templates unchanged**

10. Run `openai/whisper-base` on your NVIDIA machine. The output panel should show `[HuggingBox] Device: cuda`, not `privateuseone`. Confirm CUDA is still being used.
11. Run `runwayml/stable-diffusion-v1-5`. It should use the standard `diffusers` template (not `_sd_cpp_template()`). GPU utilisation should appear on the NVIDIA GPU tab in Task Manager.

**AMD machine — large non-GGUF LLM hint**

12. Run a `transformers_llm` model in safetensor format that is 7B+ parameters (e.g., a non-GGUF `meta-llama/Llama-3.2-3B` variant). Confirm the advisory note appears in the output panel.

---

## Summary Table

| Sprint | Changes | Primary Files | Hardware Tested |
|---|---|---|---|
| 1 | `n_gpu_layers=-1`, CUDA wheel | `script_generator.py`, `dependency_manager.py` | NVIDIA |
| 2 | `GpuVendor` enum, `HB_GPU_BACKEND` env var, cli.py threading | `lib.rs`, `cli.py` | NVIDIA + AMD |
| 3 | Vulkan wheel, DirectML swap, GGUF quant selection | `dependency_manager.py`, `script_generator.py` | AMD (primary) |
| 4 | Streaming TPS, flash attn, KV cache, partial offload | `script_generator.py` | NVIDIA + AMD |
| 5 | DirectML device injection, SD-cpp template, user hint | `script_generator.py` | AMD (primary) |

## Rollout Notes

- Sprints 1 and 2 are independent and can be merged in either order.
- Sprint 3 depends on Sprint 2 (`gpu_backend` must exist in `DependencyManager`).
- Sprint 4 depends on Sprint 2 (`gpu_backend` must exist in `ScriptGenerator`).
- Sprint 5 depends on Sprints 2, 3, and 4.
- All changes are additive and backwards-compatible. A machine without a recognised GPU falls back to `HB_GPU_BACKEND=cpu` and the existing CPU behaviour is preserved.
