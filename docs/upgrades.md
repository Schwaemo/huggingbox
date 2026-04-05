# Hardware Acceleration Upgrades

## Objective
Enable seamless, optimal hardware utilization for NVIDIA (CUDA) and AMD (Vulkan/DirectML) across the full spectrum of models available on Hugging Face (LLMs, Diffusion models, Audio models, Multimodal).

## Overview of the Problem
Currently, HuggingBox relies on standard `transformers` and `diffusers` utilizing native PyTorch. While PyTorch on Windows natively supports NVIDIA GPUs via CUDA, it defaults to CPU for AMD graphics cards. To ensure AMD users get the same accelerated "one-click" experience as NVIDIA users without massive overhead, we need to implement dynamic framework switching and targeted dependency management.

## Implementation Steps

### 1. Hardware Detection & Tagging (Rust Backend)
**File to modify:** `src-tauri/src/lib.rs`
*   **Update `SystemInfoPayload` / `GpuInfoPayload`:** Expand the definition to explicitly classify the GPU brand/acceleration pipeline.
    ```rust
    pub enum GpuBackend {
        Cuda,     // NVIDIA GPUs
        Vulkan,   // AMD / Intel GPUs for llama.cpp
        DirectML, // AMD / Intel GPUs for PyTorch pipelines
    }
    ```
*   **Enhance `detect_gpu_windows()`:** Ensure the hardware registry check accurately classifies the detected GPU string to assign the correct `GpuBackend` state, so the frontend and Python runner know what toolchain to expect.

### 2. Dependency Management Injection (Python Environment)
**File to modify:** `hf_auto_runner/dependency_manager.py` (and related Tauri invoke commands)
*   **Dynamic Torch Installation:** Intercept standard `torch` installation commands.
    *   If `backend == Cuda`: Proceed with standard PyTorch installation (e.g., `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`).
    *   If `backend == DirectML`: Intercept the installation and instead inject `torch-directml` dependencies so that non-NVIDIA users can natively execute models via Microsoft's DirectX 12 translation layer.
*   **GGUF/LLM Optimization (`llama-cpp-python` & `sdcpp-python`):** For quantized models, massive LLMs, and high-performance image generation (Stable Diffusion/FLUX), drop PyTorch natively and install lightweight C++ wrappers.
    *   If AMD: Pull the pre-compiled Vulkan wheel or compile with `CMAKE_ARGS="-DGGML_VULKAN=on"` for both `llama-cpp-python` and `sdcpp-python`.

### 3. Dynamic Script Generation (Python Runner)
**File to modify:** `hf_auto_runner/script_generator.py`
The generator must adapt the code it writes based on the hardware payload passed to it.

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
For Text-Generation models, standard `transformers` architectures run poorly on DirectML compared to native CUDA. For maximum AMD utilization (comparable to LM Studio), HuggingBox must leverage `llama.cpp` using the Vulkan backend for GGUF/Safetensor models.
*   **Check Model Format:** If the model includes `.gguf` weights or is a pure language model, pivot the generated script away from `transformers` to `llama_cpp`.
*   **Inject GGUF Execution Code:**
    ```python
    from llama_cpp import Llama
    
    # n_gpu_layers=-1 automatically offloads to CUDA or Vulkan depending on the underlying wheel
    llm = Llama(
        model_path="path/to/model.gguf",
        n_gpu_layers=-1, 
        n_ctx=4096
    )
    
    output = llm("Prompt here...", max_tokens=256)
    ```

#### C. The High-Performance Image Generation Pathway (`stable-diffusion.cpp`)
For Stable Diffusion (1.5, 2.1, SDXL, SD3) and FLUX models, rely heavily on `stable-diffusion.cpp` over Vulkan to circumvent the hefty memory requirement of loading raw models in Hugging Face Diffusers on an AMD GPU.
*   **Check Pipeline:** If the detected Hugging Face pipeline is `text-to-image` and standard diffusion files are present, generate code utilizing the `sdcpp_python` wrapper.
*   **Inject SDCPP Code:**
    ```python
    from sdcpp import StableDiffusion
    
    # VRAM aware diffusion generation on GGML backend
    sd = StableDiffusion(model_path="path/to/sd_model.safetensors")
    image = sd.generate("A majestic cat riding a skateboard", steps=20)
    image.save("output.png")
    ```

### 4. VRAM Awareness & Layer Offloading
*   **VRAM Safeguards:** Update the `script_generator` limiters to read the exact VRAM from our custom registry fetch rather than relying on PyTorch's `cuda.get_device_properties` (which won't work on DirectML).
*   **Automatic Fallback:** By knowing the total parameter count of a model vs the user's available VRAM, dynamically calculate `n_gpu_layers` for `llama.cpp` and `stable-diffusion.cpp`, or enable PyTorch's `device_map="auto"` (via `accelerate`) so the model gracefully splits computing between the CPU and the GPU to avoid immediate Out-of-Memory crashes.

## Conclusion
By splitting our execution into three native streams:
1.  **Vulkan (`llama-cpp-python`)** for high-performance LLMs.
2.  **Vulkan (`sdcpp-python`)** for high-performance Stable Diffusion and FLUX generation.
3.  **DirectML (`torch-directml`)** for generic Hugging Face pipelines (Audio, Vision, standard PyTorch architectures).

HuggingBox will achieve near-native performance for AMD and Intel hardware on Windows alongside its already capable NVIDIA CUDA support.
