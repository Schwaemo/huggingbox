# Performance Upgrades — Windows Hardware Parity

## Objective

Achieve LM Studio-comparable inference speed across all Windows hardware tiers:
NVIDIA (CUDA), AMD (Vulkan), Intel Arc (Vulkan), and CPU-only (AVX2/AVX512).
The primary lever is routing `llama.cpp` through the correct GPU-backend wheel and
enabling full GPU layer offloading. DirectML remains the fallback for PyTorch pipelines
(diffusers, audio, vision) that have no C++ equivalent yet.

---

## Hardware Tiers & Target Performance

| Tier | Hardware | Backend | Target (7B Q4_K_M tok/s) |
|---|---|---|---|
| 1 | NVIDIA RTX 3070+ | CUDA | 80–120 |
| 2 | NVIDIA GTX 1060–2080 | CUDA | 30–70 |
| 3 | AMD RX 5000–7000 | Vulkan | 40–90 |
| 4 | Intel Arc A770/A750 | Vulkan | 25–45 |
| 5 | CPU (AVX2) | llama.cpp CPU | 5–15 |
| 6 | CPU (no AVX2) | llama.cpp CPU | 1–4 |

LM Studio targets Tier 1 at ~100 tok/s. The same is achievable here once GPU offloading is wired up end-to-end.

---

## Root Cause of Current Underperformance

Three bugs today that each kill GPU utilisation entirely:

1. **`_llama_cpp_template` has no `n_gpu_layers`** — model runs 100% on CPU regardless of hardware.
2. **`DependencyManager` installs the CPU-only wheel** — `pip install llama-cpp-python` never compiles or pulls a CUDA/Vulkan build.
3. **GPU vendor is never passed into Python** — Rust detects the GPU correctly but the `gpu_vendor` and `gpu_vram` values are not forwarded to `ScriptGenerator` or `DependencyManager`.

---

## Implementation Steps

### 1. Hardware Detection & Vendor Classification (Rust)

**File:** `src-tauri/src/lib.rs`

Extend `SystemInfoPayload` with a vendor enum so Python knows which wheel to pull and which backend flags to pass:

```rust
#[derive(Serialize)]
pub enum GpuVendor {
    Nvidia,  // "nvidia" in GPU name string
    Amd,     // "amd" / "radeon" / "rx " in GPU name string
    Intel,   // "intel arc" / "intel(r) arc" in GPU name string
    None,    // no discrete GPU or detection failed
}

#[derive(Serialize)]
pub struct SystemInfoPayload {
    pub total_ram: u64,
    pub available_ram: u64,
    pub gpu_name: Option<String>,
    pub gpu_vram: Option<u64>,      // bytes, from DXGI AdapterDesc
    pub gpu_vendor: GpuVendor,      // NEW — parsed from gpu_name
    pub os_name: String,
}
```

`detect_gpu_windows()` already queries the registry/DXGI. After fetching `gpu_name`, add a
classification pass:

```rust
fn classify_vendor(name: &str) -> GpuVendor {
    let n = name.to_lowercase();
    if n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("gtx") {
        return GpuVendor::Nvidia;
    }
    if n.contains("amd") || n.contains("radeon") || n.contains("rx ") {
        return GpuVendor::Amd;
    }
    if n.contains("intel") && (n.contains("arc") || n.contains("xe")) {
        return GpuVendor::Intel;
    }
    GpuVendor::None
}
```

The `gpu_vendor` and `gpu_vram` values must be forwarded in every `generate_code` and
`install_dependencies` Tauri invoke so Python receives them.

---

### 2. Hardware-Aware Dependency Installation (Python)

**File:** `hf_auto_runner/dependency_manager.py`

Replace the flat `"llama-cpp-python"` entry with a vendor-dispatched install. The wheel
determines everything — the same Python code works on all tiers once the right `.pyd` is loaded.

#### NVIDIA — CUDA wheel

```python
# Pre-built CUDA 12.1 wheels from the official llama-cpp-python releases.
# Matches the standard PyTorch CUDA index channel version.
subprocess.run([
    python_exec, "-m", "pip", "install",
    "llama-cpp-python",
    "--extra-index-url",
    "https://abetlen.github.io/llama-cpp-python/whl/cu121",
], check=True)
```

#### AMD & Intel Arc — Vulkan wheel

Pre-built Vulkan wheels are published by the community. If unavailable for the current
Python version, fall back to source compilation with the Vulkan flag:

```python
# Option A: try the pre-built Vulkan wheel first (faster)
try:
    subprocess.run([
        python_exec, "-m", "pip", "install",
        "llama-cpp-python",
        "--extra-index-url",
        "https://github.com/abetlen/llama-cpp-python/releases/expanded_assets/latest",
        "--find-links", "https://github.com/abetlen/llama-cpp-python/releases",
    ], check=True)
except subprocess.CalledProcessError:
    # Option B: compile from source with Vulkan enabled
    env = os.environ.copy()
    env["CMAKE_ARGS"] = "-DGGML_VULKAN=on"
    env["FORCE_CMAKE"] = "1"
    subprocess.run([
        python_exec, "-m", "pip", "install",
        "llama-cpp-python", "--no-binary", "llama-cpp-python",
    ], check=True, env=env)
```

> Vulkan must be installed on the host machine (ships with Windows 10+ GPU drivers for
> both AMD and Intel).

#### CPU-only

```python
# Standard wheel auto-detects AVX2/AVX512 at load time — no extra flags needed.
subprocess.run([python_exec, "-m", "pip", "install", "llama-cpp-python"], check=True)
```

#### PyTorch pipelines (diffusers / audio / vision) on AMD/Intel

For runtimes that cannot use llama.cpp (`diffusers`, `transformers_audio`,
`transformers_multimodal`), replace the standard `torch` entry with `torch-directml`:

```python
if runtime in ("diffusers", "transformers_audio", "transformers_multimodal",
               "transformers_llm", "transformers_generic"):
    if gpu_vendor in ("amd", "intel"):
        # torch-directml = DirectX 12 translation layer for PyTorch ops
        deps = [d for d in deps if d not in ("torch", "torchvision", "torchaudio")]
        deps.append("torch-directml")
```

---

### 3. llama.cpp Template Overhaul (Script Generator)

**File:** `hf_auto_runner/script_generator.py`

This is the highest-impact change. Passing `gpu_vendor` and `gpu_vram_bytes` into
`ScriptGenerator.__init__` enables five improvements at once.

#### A. Full GPU Layer Offloading

```python
# n_gpu_layers=-1 → push every layer to VRAM (CUDA or Vulkan, auto-detected by the wheel)
llm = Llama(
    model_path=model_path,
    n_gpu_layers=-1,     # was missing — this is why performance matched CPU
    n_ctx=4096,
    verbose=False,       # suppress llama.cpp internal progress spam in the output panel
)
```

#### B. Smart GGUF Quantisation Selection

LM Studio selects the best quant that fits in available VRAM. Match that behaviour:

```python
QUANT_PRIORITY = [
    # (vram_min_bytes, filename_substring, label)
    (17_000_000_000, "Q8_0",   "Q8_0"),
    (12_000_000_000, "Q6_K",   "Q6_K"),
    ( 8_000_000_000, "Q5_K_M", "Q5_K_M"),
    ( 5_000_000_000, "Q4_K_M", "Q4_K_M"),   # LM Studio default
    ( 3_500_000_000, "Q3_K_M", "Q3_K_M"),
    (         0,     "Q2_K",   "Q2_K"),      # last resort
]

def pick_gguf(filenames: list[str], vram_bytes: int) -> str:
    gguf_files = [f for f in filenames if f.endswith(".gguf")]
    for vram_min, substr, _ in QUANT_PRIORITY:
        if vram_bytes >= vram_min:
            match = next((f for f in gguf_files if substr.lower() in f.lower()), None)
            if match:
                return match
    # Fallback: smallest available file
    return sorted(gguf_files, key=lambda f: f)[0] if gguf_files else None
```

The `vram_bytes` value comes from `SystemInfoPayload.gpu_vram` forwarded through the
Tauri invoke. For CPU-only machines pass `0` to force the smallest quant.

#### C. Flash Attention (NVIDIA only)

Flash attention halves VRAM usage for long contexts and meaningfully increases throughput
on Ampere (RTX 3000+) and Ada Lovelace (RTX 4000+) cards. It is not yet stable on Vulkan.

```python
flash_attn = gpu_vendor == "nvidia"

llm = Llama(
    model_path=model_path,
    n_gpu_layers=-1,
    n_ctx=4096,
    flash_attn=flash_attn,
    verbose=False,
)
```

#### D. KV Cache Quantisation for Long Contexts

Reduces memory pressure when context windows are large (>2k tokens). Safe on all backends.

```python
llm = Llama(
    model_path=model_path,
    n_gpu_layers=-1,
    n_ctx=4096,
    flash_attn=flash_attn,
    type_k=8,   # Q8_0 KV cache — negligible quality loss, ~40% VRAM saving at 4k ctx
    type_v=8,
    verbose=False,
)
```

#### E. Streaming Output with TPS Counter

LM Studio shows real-time token throughput. Replicate it in the output panel stream:

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
print(f"\n\n[HuggingBox] {token_count} tokens in {elapsed:.1f}s ({tps:.1f} tok/s)", flush=True)
```

---

### 4. DirectML Device Injection (PyTorch Pipelines)

**File:** `hf_auto_runner/script_generator.py`

For runtimes that stay on PyTorch (`diffusers`, `transformers_audio`,
`transformers_multimodal`, `transformers_llm`), inject the DirectML device block when
`gpu_vendor` is `"amd"` or `"intel"`:

```python
import torch

if torch.cuda.is_available():
    device = "cuda"
else:
    try:
        import torch_directml
        device = torch_directml.device()
    except ImportError:
        device = "cpu"

print(f"[HuggingBox] Device: {device}", flush=True)
```

All `.to(device)` and `pipe(...).to(device)` calls downstream use this variable.
`torch_directml.device()` returns a device object, not a string — ensure it is passed
directly to `.to()` and not coerced to `str` before passing.

---

### 5. VRAM-Aware `n_gpu_layers` for Partial Offload

When the model is too large to fit entirely in VRAM, calculate a partial layer count
instead of crashing with OOM. This is what LM Studio's "partial offload" mode does.

Rough heuristic (better than nothing, can be tuned with real profiling data):

```python
def calc_gpu_layers(param_billions: float, vram_bytes: int, quant_bits: int = 4) -> int:
    """
    Estimate how many transformer layers fit in VRAM given quantisation.
    param_billions: total model parameter count in billions (from config.json)
    vram_bytes: available VRAM from SystemInfoPayload
    quant_bits: effective bits per weight (4 for Q4_K_M, 8 for Q8_0, etc.)
    """
    # Leave 10% VRAM headroom for activations and KV cache
    usable_vram = vram_bytes * 0.90
    bytes_per_param = quant_bits / 8
    total_model_bytes = param_billions * 1e9 * bytes_per_param

    if usable_vram >= total_model_bytes:
        return -1  # full offload

    # Linear interpolation — assumes uniform layer size
    num_layers = 32  # typical for 7B models; read from config.json for accuracy
    bytes_per_layer = total_model_bytes / num_layers
    return max(1, int(usable_vram / bytes_per_layer))
```

Pass `n_gpu_layers=calc_gpu_layers(...)` instead of a hardcoded `-1` when VRAM is detected
as insufficient for the chosen quant.

---

## Rollout Order

These changes compose together but can be shipped independently:

| Priority | Change | Impact | Effort |
|---|---|---|---|
| P0 | `n_gpu_layers=-1` in llama_cpp template | Unlocks all GPU tiers immediately | 5 min |
| P0 | CUDA wheel in DependencyManager | NVIDIA users go from CPU to full GPU | 15 min |
| P1 | Vulkan wheel in DependencyManager | AMD/Intel users get GPU | 30 min |
| P1 | `gpu_vendor` forwarded Rust → Python | Enables all conditional logic below | 1 hr |
| P1 | Smart GGUF quant selection | Picks best quality that fits in VRAM | 1 hr |
| P2 | Streaming output + TPS counter | UX parity with LM Studio | 1 hr |
| P2 | Flash attention (NVIDIA) | +15–25% throughput on RTX cards | 30 min |
| P2 | KV cache quantisation | Longer contexts without OOM | 30 min |
| P3 | DirectML fallback (PyTorch pipelines) | AMD/Intel on diffusers/audio/vision | 2 hr |
| P3 | Partial layer offload calculation | Graceful OOM prevention | 2 hr |
