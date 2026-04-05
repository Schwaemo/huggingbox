# Performance Upgrades — Windows Hardware Parity

## Objective
Enable seamless, optimal hardware utilization for NVIDIA (CUDA), AMD, and Intel GPUs across the full spectrum of models available on Hugging Face (LLMs, Diffusion models, Audio models, Multimodal) on Windows.

## Overview of the Problem
Currently, HuggingBox relies on standard `transformers` and `diffusers` utilizing native PyTorch. While PyTorch on Windows natively supports NVIDIA GPUs via CUDA, it defaults to CPU for AMD and Intel graphics cards. To ensure AMD/Intel users get the same accelerated "one-click" experience as NVIDIA users without massive overhead, we need to implement dynamic framework switching and targeted dependency management.

## Implementation Steps

### 1. Hardware Detection & Tagging (Rust Backend)
**File to modify:** `src-tauri/src/lib.rs`
*   **Update `SystemInfoPayload` / `GpuInfoPayload`:** Expand the definition to classify the GPU vendor, from which the Python layer derives the appropriate per-runtime backend.
    ```rust
    pub enum GpuVendor {
        Nvidia,  // → CUDA for all runtimes
        Amd,     // → Vulkan for llama-cpp / stable-diffusion-cpp, DirectML for torch / onnxruntime
        Intel,   // → DirectML for all runtimes (Arc discrete + integrated)
        Unknown, // → CPU fallback
    }
    ```
    > **Note on single enum vs per-runtime backend:** The same GPU needs Vulkan for C++ runtimes and DirectML for PyTorch/ONNX runtimes. `GpuVendor` captures the hardware fact; the Python `dependency_manager` and `script_generator` perform the vendor → backend mapping per runtime type.

*   **Enhance `detect_gpu_windows()`:** Ensure the hardware registry check accurately classifies the detected GPU string to assign the correct `GpuVendor`. When multiple GPUs are detected, prefer discrete over integrated. Priority order: `NVIDIA > AMD discrete > Intel Arc discrete > Intel integrated (UHD / Iris / Radeon Graphics)`.

*   **Handoff to Python:** The Tauri backend passes the detected vendor to the Python subprocess via the `HB_GPU_BACKEND` environment variable (values: `cuda`, `amd`, `intel`, `cpu`). This joins the existing `HB_INPUT` and `HF_TOKEN` env vars set in `executor.py`. All Python components (`DependencyManager`, `ScriptGenerator`, `RuntimeRouter`) read this variable.

### 2. Dependency Management Injection (Python Environment)
**File to modify:** `hf_auto_runner/dependency_manager.py` (and related Tauri invoke commands)
*   **Dynamic Torch Installation:** Intercept standard `torch` installation commands.
    *   If `HB_GPU_BACKEND == cuda`: Proceed with standard PyTorch installation (e.g., `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`).
    *   If `HB_GPU_BACKEND == amd` or `intel`: Intercept the installation and instead inject `torch-directml` so that non-NVIDIA users can natively execute models via Microsoft's DirectX 12 translation layer. Do **not** install standard `torch` alongside `torch-directml` in the same venv — they conflict.

    > **DirectML status:** `torch-directml` and `onnxruntime-directml` are built on DirectML, which Microsoft has placed in maintenance mode (security fixes only, no new features). They remain functional for current hardware and drivers. Vulkan-based C++ runtimes (`llama-cpp-python`, `stable-diffusion-cpp-python`) are the more future-proof path for heavy workloads.

*   **GGUF/LLM Optimization (`llama-cpp-python`):** For quantized LLMs, drop PyTorch and install the lightweight C++ wrapper.
    *   If AMD or Intel: Pull the pre-compiled Vulkan wheel or compile with `CMAKE_ARGS="-DGGML_VULKAN=on" pip install llama-cpp-python`.
    *   If NVIDIA: Standard install or compile with `CMAKE_ARGS="-DGGML_CUDA=on"`.

*   **Image Generation Optimization (`stable-diffusion-cpp-python`):** For Stable Diffusion and FLUX models on AMD/Intel, install the C++ wrapper instead of Diffusers.
    *   If AMD or Intel: `CMAKE_ARGS="-DSD_VULKAN=ON" pip install stable-diffusion-cpp-python`.
    *   If NVIDIA: Standard `pip install stable-diffusion-cpp-python` (uses CUDA automatically).

*   **ONNX DirectML swap:** When the runtime is `onnxruntime` and `HB_GPU_BACKEND != cuda`, replace `onnxruntime` with `onnxruntime-directml` (`pip install onnxruntime-directml`). This is a drop-in replacement — the `DmlExecutionProvider` is selected automatically.

### 3. Dynamic Script Generation (Python Runner)
**File to modify:** `hf_auto_runner/script_generator.py`
The generator must adapt the code it writes based on `HB_GPU_BACKEND`.

#### A. The Generic Audio / Vision / Multimodal Pathway (PyTorch)
For models retaining the Hugging Face `pipeline` where C++ rewrites don't exist yet (Whisper, zero-shot audio, generic vision models):
*   Modify the device assignment logic to fall back to DirectML natively on Windows:
    ```python
    import torch

    device = "cpu"
    if torch.cuda.is_available():
        device = "cuda"
    else:
        try:
            import torch_directml
            device = torch_directml.device()
        except ImportError:
            pass
    ```
*   Ensure that any `.to(device)` calls across the script templates properly handle the DirectML device object gracefully.

#### B. The High-Performance Text Generation Pathway (`llama.cpp`)
For Text-Generation models, standard `transformers` architectures run poorly on DirectML compared to native CUDA. For maximum AMD utilization (comparable to LM Studio), HuggingBox must leverage `llama.cpp` using the Vulkan backend for GGUF models.
*   **Check Model Format:** If the model includes `.gguf` weights, pivot the generated script away from `transformers` to `llama_cpp`.
*   **Inject GGUF Execution Code:**
    ```python
    from llama_cpp import Llama

    # n_gpu_layers=-1 automatically offloads all layers to CUDA or Vulkan
    # depending on the underlying wheel compiled flags
    llm = Llama(
        model_path="path/to/model.gguf",
        n_gpu_layers=-1,
        n_ctx=4096
    )

    output = llm("Prompt here...", max_tokens=256)
    ```

> **Non-GGUF LLMs on AMD:** For large safetensor language models (e.g., Llama 3 in `.safetensors`) on AMD, the `transformers_llm` runtime will use `torch-directml` as the device. Performance for large models (7B+) may be significantly lower than CUDA due to DirectML's overhead on autoregressive decoding. Users should be informed via the UI to prefer GGUF variants of large models for AMD hardware.

#### C. The High-Performance Image Generation Pathway (`stable-diffusion-cpp-python`)
For Stable Diffusion (1.5, 2.1, SDXL, SD3) and FLUX models, rely on `stable-diffusion-cpp-python` over Vulkan to circumvent the high VRAM requirement of loading raw models in Hugging Face Diffusers on an AMD GPU.
*   **Check Pipeline:** If the detected Hugging Face pipeline is `text-to-image` and `HB_GPU_BACKEND` is `amd` or `intel`, generate code using the `stable_diffusion_cpp` wrapper instead of Diffusers.
*   **Inject stable-diffusion-cpp-python Code:**
    ```python
    from stable_diffusion_cpp import StableDiffusion

    # Vulkan backend is active automatically when the wheel was compiled with -DSD_VULKAN=ON
    sd = StableDiffusion(model_path="path/to/sd_model.safetensors")
    output = sd.generate_image(
        prompt="A majestic cat riding a skateboard",
        width=512,
        height=512,
        sample_steps=20,
    )
    output[0].save("output.png")
    ```

#### D. The ONNX / Encoder Model Pathway (`onnxruntime-directml`)
For models already routed to `onnxruntime` (ONNX-exported encoder models, optimized classification/embedding pipelines), `onnxruntime-directml` is a drop-in replacement that activates the `DmlExecutionProvider` automatically on AMD and Intel hardware.
*   **When `runtime == onnxruntime` and `HB_GPU_BACKEND != cuda`:** The dependency manager installs `onnxruntime-directml` instead of `onnxruntime`. No script changes are required, but explicitly pass the provider list for clarity:
    ```python
    import onnxruntime as ort

    # DmlExecutionProvider is available when onnxruntime-directml is installed
    session = ort.InferenceSession(
        "model.onnx",
        providers=["DmlExecutionProvider", "CPUExecutionProvider"]
    )
    ```

### 4. VRAM Awareness & Layer Offloading
*   **VRAM Safeguards:** Update the `script_generator` limiters to read the exact VRAM from our custom registry fetch rather than relying on PyTorch's `cuda.get_device_properties` (which won't work on DirectML).
*   **Automatic Fallback:** By knowing the total parameter count of a model vs the user's available VRAM, dynamically calculate `n_gpu_layers` for `llama.cpp` and `stable-diffusion-cpp-python`, or enable PyTorch's `device_map="auto"` (via `accelerate`) so the model gracefully splits computing between the CPU and the GPU to avoid immediate Out-of-Memory crashes.

## Conclusion
By splitting execution into four native streams:
1.  **Vulkan (`llama-cpp-python`)** — high-performance quantized LLMs (GGUF) on AMD/Intel.
2.  **Vulkan (`stable-diffusion-cpp-python`)** — high-performance Stable Diffusion and FLUX generation on AMD/Intel.
3.  **DirectML (`torch-directml`)** — generic Hugging Face pipelines (Audio, Vision, non-GGUF Transformers) on AMD/Intel.
4.  **DirectML (`onnxruntime-directml`)** — ONNX-routed encoder/inference models on AMD/Intel.

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
