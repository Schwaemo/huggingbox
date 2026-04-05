# Hardware Acceleration Upgrades

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

HuggingBox will achieve near-native performance for AMD and Intel hardware on Windows alongside its already capable NVIDIA CUDA support.
