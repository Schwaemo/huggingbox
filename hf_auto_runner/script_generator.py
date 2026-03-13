import os
from typing import Any, Dict


class ScriptGenerator:
    def __init__(self, model_id: str, metadata: Dict[str, Any], runtime: str, architecture: str):
        self.model_id = model_id
        self.metadata = metadata
        self.runtime = runtime
        self.architecture = architecture
        self.has_processor = metadata.get("has_processor", False)
        self.has_tokenizer = metadata.get("has_tokenizer", False)

    def generate_script(self, output_dir: str) -> str:
        code = self._get_template()
        output_path = os.path.join(output_dir, "inference.py")

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(code)

        return output_path

    def get_raw_script(self) -> str:
        return self._get_template()

    def _get_template(self) -> str:
        if self.runtime == "llama_cpp":
            return self._llama_cpp_template()
        if self.runtime == "diffusers":
            return self._diffusers_template()
        if self.runtime == "transformers_multimodal":
            return self._multimodal_template()
        if self.runtime == "transformers_audio":
            return self._audio_template()
        if self.runtime == "transformers_llm":
            return self._llm_template()
        return self._generic_template()

    def _metadata_header(self) -> str:
        pipeline_tag = self.metadata.get("pipeline_tag") or "unknown"
        return (
            f"# MODEL: {self.model_id}\n"
            f"# ARCHITECTURE: {self.architecture}\n"
            f"# RUNTIME: {self.runtime}\n"
            f"# PIPELINE: {pipeline_tag}\n"
        )

    def _llama_cpp_template(self) -> str:
        return self._metadata_header() + f"""
import os
from huggingface_hub import hf_hub_download

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None

print("Finding GGUF file for llama.cpp...")
filenames = {self.metadata.get("filenames", [])}
gguf_file = next((f for f in filenames if f.endswith(".gguf")), None)

if not gguf_file:
    raise RuntimeError("No GGUF file found in repo!")

print(f"Downloading {{gguf_file}}...")
model_path = hf_hub_download(repo_id=model_id, filename=gguf_file, token=hf_token)

from llama_cpp import Llama
print("Loading model...")
llm = Llama(model_path=model_path, n_ctx=2048)

user_input = os.environ.get("HB_INPUT", "").strip()
prompt = user_input if user_input else "Q: What is the capital of France? A:"

print(f"Prompt: {{prompt}}")
print("Running inference...")
output = llm(prompt, max_tokens=128, echo=True)
print("\\n" + "="*40)
print(output['choices'][0]['text'])
print("="*40)
"""

    def _diffusers_template(self) -> str:
        pipeline_tag = (self.metadata.get("pipeline_tag") or "").lower()
        model_type = (self.metadata.get("config", {}).get("model_type") or "").lower()
        return self._metadata_header() + f"""
import json
import os
from datetime import datetime

import torch
from PIL import Image
from PIL import ImageStat
from diffusers import (
    StableDiffusionImg2ImgPipeline,
    StableDiffusionInpaintPipeline,
    StableDiffusionPipeline,
    StableDiffusionXLImg2ImgPipeline,
    StableDiffusionXLInpaintPipeline,
    StableDiffusionXLPipeline,
)

model_id = "{self.model_id}"
pipeline_tag = "{pipeline_tag}"
model_type = "{model_type}"
architecture_name = "{self.architecture}"
hf_token = os.environ.get("HF_TOKEN") or None


def _read_env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return float(raw)


def _read_env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return int(raw)


def _determine_mode() -> str:
    requested = (os.environ.get("HB_DIFFUSION_MODE") or pipeline_tag or "text-to-image").strip().lower()
    if requested in ("text-to-image", "image-to-image", "inpainting"):
        return requested
    return "text-to-image"


def _is_sdxl_family() -> bool:
    haystack = " ".join([model_id.lower(), model_type.lower(), architecture_name.lower()])
    return any(token in haystack for token in [
        "sdxl",
        "stable-diffusion-xl",
        "stable diffusion xl",
        "xl-base",
        "xl-refiner",
    ])


def _load_image(path: str, label: str) -> Image.Image:
    if not path:
        raise RuntimeError(f"{{label}} path is required.")
    if not os.path.isfile(path):
        raise RuntimeError(f"{{label}} file not found: {{path}}")
    print(f"Loading {{label}}: {{path}}", flush=True)
    return Image.open(path).convert("RGB")


def _is_black_image(image: Image.Image, threshold: float = 2.0) -> bool:
    grayscale = image.convert("L")
    stat = ImageStat.Stat(grayscale)
    max_pixel = stat.extrema[0][1] if stat.extrema else 0
    mean_pixel = stat.mean[0] if stat.mean else 0.0
    print(
        f"Image brightness stats -> max={{max_pixel}}, mean={{mean_pixel:.3f}}",
        flush=True,
    )
    return max_pixel <= threshold and mean_pixel <= threshold


def _log_safety_flags(result) -> bool:
    flags = getattr(result, "nsfw_content_detected", None)
    if flags is None:
        print("Safety checker flags: unavailable", flush=True)
        return False

    try:
        flagged = any(bool(item) for item in flags)
    except Exception:
        flagged = bool(flags)

    print(f"Safety checker flags: {{flags}}", flush=True)
    if flagged:
        print(
            "Safety checker appears to have replaced one or more outputs. This commonly produces black images.",
            flush=True,
        )
    return flagged


def _run_pipe(pipe, kwargs):
    print("Starting diffusion inference...", flush=True)
    try:
        return pipe(**kwargs)
    except TypeError as callback_error:
        print(f"Pipeline callback signature rejected, retrying without callback: {{callback_error}}", flush=True)
        fallback_kwargs = dict(kwargs)
        fallback_kwargs.pop("callback", None)
        fallback_kwargs.pop("callback_steps", None)
        return pipe(**fallback_kwargs)


def _should_upcast_vae(pipe) -> bool:
    vae = getattr(pipe, "vae", None)
    if vae is None:
        return False
    if getattr(vae, "dtype", None) != torch.float16:
        return False
    config = getattr(vae, "config", None)
    return bool(getattr(config, "force_upcast", False)) or "xl" in pipe.__class__.__name__.lower()


mode = _determine_mode()
prompt = os.environ.get("HB_INPUT", "").strip()
negative_prompt = os.environ.get("HB_NEGATIVE_PROMPT", "").strip()
source_image_path = os.environ.get("HB_SOURCE_IMAGE", "").strip()
mask_path = os.environ.get("HB_MASK_PATH", "").strip()
steps = max(1, _read_env_int("HB_STEPS", 30))
guidance_scale = _read_env_float("HB_GUIDANCE_SCALE", 7.5)
seed_text = os.environ.get("HB_SEED", "").strip()
num_images = max(1, _read_env_int("HB_NUM_IMAGES", 1))
strength = max(0.0, min(1.0, _read_env_float("HB_STRENGTH", 0.75)))
output_dir = os.environ.get("HB_OUTPUT_DIR", "").strip() or os.path.abspath(os.path.join(os.getcwd(), "outputs"))
device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float32
is_sdxl = _is_sdxl_family()

print(f"Loading diffusion runtime for {{model_id}}...", flush=True)
print(f"Diffusion mode: {{mode}}", flush=True)
print(f"Diffusion family: {{'SDXL' if is_sdxl else 'SD/compatible'}}", flush=True)
print(f"Execution device: {{device}}", flush=True)
print("Diffusion precision: float32", flush=True)
print(f"Output directory: {{output_dir}}", flush=True)

if not prompt:
    raise RuntimeError("Diffusion generation requires a prompt in HB_INPUT.")

if mode in ("image-to-image", "inpainting") and not source_image_path:
    raise RuntimeError("Source image is required in HB_SOURCE_IMAGE for image-to-image and inpainting.")

if mode == "inpainting" and not mask_path:
    raise RuntimeError("Mask image is required in HB_MASK_PATH for inpainting.")

os.makedirs(output_dir, exist_ok=True)

source_image = _load_image(source_image_path, "source image") if source_image_path else None
mask_image = _load_image(mask_path, "mask image") if mask_path else None

generator = None
if seed_text:
    seed_value = int(seed_text)
    generator = torch.Generator(device="cuda" if device == "cuda" else "cpu").manual_seed(seed_value)
    print(f"Using manual seed: {{seed_value}}", flush=True)
else:
    print("Using random seed.", flush=True)

if mode == "text-to-image":
    pipeline_cls = StableDiffusionXLPipeline if is_sdxl else StableDiffusionPipeline
elif mode == "image-to-image":
    pipeline_cls = StableDiffusionXLImg2ImgPipeline if is_sdxl else StableDiffusionImg2ImgPipeline
else:
    pipeline_cls = StableDiffusionXLInpaintPipeline if is_sdxl else StableDiffusionInpaintPipeline

print(f"Selected pipeline class: {{pipeline_cls.__name__}}", flush=True)
print("Loading pipeline weights...", flush=True)

pipe = pipeline_cls.from_pretrained(
    model_id,
    torch_dtype=torch_dtype,
    token=hf_token,
)

print("Configuring pipeline memory settings...", flush=True)
pipe = pipe.to(device)
print(f"Pipeline torch dtype: {{torch_dtype}}", flush=True)

if device == "cuda":
    total_vram_gb = 0.0
    try:
        total_vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception as gpu_info_error:
        print(f"Could not inspect CUDA VRAM: {{gpu_info_error}}", flush=True)

    print(f"Detected CUDA VRAM: {{total_vram_gb:.1f}} GB", flush=True)
    if total_vram_gb and total_vram_gb < 8.0:
        try:
            pipe.enable_attention_slicing()
            print("Enabled attention slicing for low-VRAM GPU.", flush=True)
        except Exception as slicing_error:
            print(f"Could not enable attention slicing: {{slicing_error}}", flush=True)
        try:
            pipe.enable_vae_slicing()
            print("Enabled VAE slicing for low-VRAM GPU.", flush=True)
        except Exception as vae_slicing_error:
            print(f"Could not enable VAE slicing: {{vae_slicing_error}}", flush=True)

    try:
        pipe.enable_xformers_memory_efficient_attention()
        print("Enabled xformers memory-efficient attention.", flush=True)
    except Exception as xformers_error:
        print(f"xformers not available or unsupported: {{xformers_error}}", flush=True)

    if _should_upcast_vae(pipe):
        try:
            pipe.upcast_vae()
            print("Upcast VAE for more reliable decoding.", flush=True)
        except Exception as upcast_error:
            print(f"Could not upcast VAE: {{upcast_error}}", flush=True)
else:
    print("Running diffusion on CPU with float32.", flush=True)


def _progress_callback(step: int, timestep: int, latents) -> None:
    completed = int(step) + 1
    percent = round((completed / max(steps, 1)) * 100.0, 1)
    payload = json.dumps({{"step": completed, "total_steps": steps, "percent": percent}})
    print(f"HB_DIFFUSION_PROGRESS:{{payload}}", flush=True)


common_kwargs = {{
    "prompt": prompt,
    "negative_prompt": negative_prompt or None,
    "num_inference_steps": steps,
    "guidance_scale": guidance_scale,
    "num_images_per_prompt": num_images,
    "generator": generator,
    "callback": _progress_callback,
    "callback_steps": 1,
}}

if mode == "image-to-image":
    common_kwargs["image"] = source_image
    common_kwargs["strength"] = strength
elif mode == "inpainting":
    common_kwargs["image"] = source_image
    common_kwargs["mask_image"] = mask_image
    common_kwargs["strength"] = strength

print("Starting diffusion inference...", flush=True)
result = _run_pipe(pipe, common_kwargs)

images = list(getattr(result, "images", []) or [])
if not images:
    raise RuntimeError("Diffusion pipeline produced no images.")

safety_flagged = _log_safety_flags(result)
all_black = all(_is_black_image(image) for image in images)
print(f"All generated images black: {{all_black}}", flush=True)

if all_black and not safety_flagged and device == "cuda" and torch_dtype == torch.float16:
    print(
        "Black image detected without a safety checker flag. Retrying once with safer VAE decode settings.",
        flush=True,
    )
    retried = False
    if hasattr(pipe, "upcast_vae"):
        try:
            pipe.upcast_vae()
            print("Retry path: VAE upcast enabled.", flush=True)
            retried = True
        except Exception as retry_upcast_error:
            print(f"Retry path could not upcast VAE: {{retry_upcast_error}}", flush=True)

    if retried:
        result = _run_pipe(pipe, common_kwargs)
        images = list(getattr(result, "images", []) or [])
        safety_flagged = _log_safety_flags(result)
        if not images:
            raise RuntimeError("Diffusion retry produced no images.")
        all_black = all(_is_black_image(image) for image in images)
        print(f"Post-retry all generated images black: {{all_black}}", flush=True)

if all_black:
    raise RuntimeError(
        "Generated image is black. Inspect the logs above for safety checker flags or decode issues."
    )

run_prefix = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
saved_paths = []
print(f"Saving {{len(images)}} generated image(s)...", flush=True)
for index, image in enumerate(images, start=1):
    out_path = os.path.abspath(os.path.join(output_dir, f"{{run_prefix}}_{{index:02d}}.png"))
    image.save(out_path)
    saved_paths.append(out_path)
    print(f"HB_OUTPUT_IMAGE:{{out_path}}", flush=True)
    print(f"Saved image {{index}} to {{out_path}}", flush=True)

print(f"HB_OUTPUT_IMAGES:{{json.dumps(saved_paths)}}", flush=True)
print("Diffusion generation completed successfully.", flush=True)
"""

    def _multimodal_template(self) -> str:
        pipeline_tag = (self.metadata.get("pipeline_tag") or "").lower()
        model_type = (self.metadata.get("config", {}).get("model_type") or "").lower()
        return self._metadata_header() + "# MULTIMODAL_TASK: auto\n" + f"""
import json
import os
import tempfile
import uuid

import torch
from PIL import Image
from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoProcessor

model_id = "{self.model_id}"
pipeline_tag = "{pipeline_tag}"
model_type = "{model_type}"
architecture_name = "{self.architecture}"
hf_token = os.environ.get("HF_TOKEN") or None
device = "cuda" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if device == "cuda" else torch.float32


def _default_task() -> str:
    requested = (os.environ.get("HB_MULTIMODAL_TASK") or "").strip().lower()
    if requested in ("visual-question-answering", "image-captioning", "document-understanding"):
        return requested
    if pipeline_tag in ("image-to-text", "image-text-to-text"):
        return "image-captioning"
    if pipeline_tag == "document-question-answering" or "ocr" in architecture_name.lower():
        return "document-understanding"
    return "visual-question-answering"


def _family() -> str:
    haystack = " ".join([model_id.lower(), model_type.lower(), architecture_name.lower()])
    if "florence" in haystack:
        return "florence"
    if "qwen2_vl" in haystack or "qwen-vl" in haystack or "qwen2-vl" in haystack:
        return "qwen_vl"
    if "llava" in haystack:
        return "llava"
    if "internvl" in haystack:
        return "internvl"
    if "paligemma" in haystack:
        return "paligemma"
    if "ocr" in haystack or pipeline_tag == "document-question-answering":
        return "ocr"
    return "generic"


def _require_existing_file(path: str, label: str) -> str:
    if not path:
        raise RuntimeError(f"{{label}} path is required.")
    if not os.path.isfile(path):
        raise RuntimeError(f"{{label}} file not found: {{path}}")
    return path


def _prepare_document_path(path: str) -> str:
    source = _require_existing_file(path, "Document")
    lower = source.lower()
    if not lower.endswith(".pdf"):
        return source

    print(f"Rasterizing first PDF page: {{source}}", flush=True)
    try:
        import fitz
    except Exception as fitz_error:
        raise RuntimeError(f"PyMuPDF is required for PDF document support: {{fitz_error}}")

    runtime_dir = os.path.join(tempfile.gettempdir(), "huggingbox_inputs")
    os.makedirs(runtime_dir, exist_ok=True)
    out_path = os.path.join(runtime_dir, f"pdf_page_{{uuid.uuid4().hex[:8]}}.png")

    doc = fitz.open(source)
    try:
        if doc.page_count < 1:
            raise RuntimeError("PDF has no pages.")
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        pix.save(out_path)
    finally:
        doc.close()

    print(f"Rasterized first page to: {{out_path}}", flush=True)
    return out_path


def _resolve_reference_image(task: str) -> str:
    image_path = (os.environ.get("HB_IMAGE_PATH") or "").strip()
    document_path = (os.environ.get("HB_DOCUMENT_PATH") or "").strip()
    if task == "document-understanding":
        return _prepare_document_path(document_path)
    return _require_existing_file(image_path, "Image")


def _prompt_for_task(task: str) -> str:
    text = (os.environ.get("HB_INPUT") or "").strip()
    if task == "visual-question-answering":
        if not text:
            raise RuntimeError("Visual question answering requires a question in HB_INPUT.")
        return text
    if task == "image-captioning":
        return "Describe this image in detail."
    if task == "document-understanding":
        return text or "Extract the important text and structure from this document."
    raise RuntimeError(f"Unsupported multimodal task: {{task}}")


def _maybe_json(text: str):
    trimmed = text.strip()
    if not trimmed:
        return None
    try:
        return json.loads(trimmed)
    except Exception:
        return None


def _to_device(batch):
    if isinstance(batch, dict):
        return {{k: v.to(device) if hasattr(v, "to") else v for k, v in batch.items()}}
    if hasattr(batch, "to"):
        return batch.to(device)
    return batch


def _decode_generated(processor, outputs, inputs) -> str:
    input_ids = None
    if isinstance(inputs, dict):
        input_ids = inputs.get("input_ids")
    elif hasattr(inputs, "input_ids"):
        input_ids = inputs.input_ids

    generated_ids = outputs[0]
    if input_ids is not None and hasattr(input_ids, "shape") and len(input_ids.shape) > 1:
        input_len = input_ids.shape[1]
        if outputs.shape[1] > input_len:
            generated_ids = outputs[0][input_len:]

    if hasattr(processor, "decode"):
        return processor.decode(generated_ids, skip_special_tokens=True)
    tokenizer = getattr(processor, "tokenizer", None)
    if tokenizer and hasattr(tokenizer, "decode"):
        return tokenizer.decode(generated_ids, skip_special_tokens=True)
    return str(generated_ids)


def _florence_prompt(task: str, prompt: str) -> str:
    if task == "image-captioning":
        return "<MORE_DETAILED_CAPTION>"
    if task == "visual-question-answering":
        return f"<VQA>{{prompt}}"
    return "<OCR>"


def _prepare_inputs(processor, image, task: str, prompt: str, family: str, image_path: str):
    print(f"Preparing multimodal inputs for family={{family}}, task={{task}}", flush=True)

    if family == "florence":
        text = _florence_prompt(task, prompt)
        print(f"Florence prompt: {{text}}", flush=True)
        return _to_device(processor(text=text, images=image, return_tensors="pt"))

    if family in ("llava", "qwen_vl", "internvl", "paligemma", "generic"):
        messages = [
            {{
                "role": "user",
                "content": [
                    {{"type": "image", "image": image_path}},
                    {{"type": "text", "text": prompt}},
                ],
            }}
        ]
        try:
            chat_text = processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
            print("Using processor chat template.", flush=True)
            return _to_device(processor(images=image, text=chat_text, return_tensors="pt"))
        except Exception as chat_error:
            print(f"Chat template unavailable; falling back to processor(images, text): {{chat_error}}", flush=True)
            return _to_device(processor(images=image, text=prompt, return_tensors="pt"))

    if family == "ocr":
        return _to_device(processor(images=image, text=prompt, return_tensors="pt"))

    return _to_device(processor(images=image, text=prompt, return_tensors="pt"))


print(f"Loading multimodal model {{model_id}}...", flush=True)
task = _default_task()
family = _family()
print(f"Selected multimodal task: {{task}}", flush=True)
print(f"Detected multimodal family: {{family}}", flush=True)
print(f"Execution device: {{device}}", flush=True)

reference_image_path = _resolve_reference_image(task)
prompt = _prompt_for_task(task)
print(f"HB_REFERENCE_IMAGE:{{reference_image_path}}", flush=True)
print(f"Reference image resolved to: {{reference_image_path}}", flush=True)
print(f"Effective prompt: {{prompt}}", flush=True)

try:
    print("Loading processor...", flush=True)
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True, token=hf_token)

    print("Loading multimodal model weights...", flush=True)
    try:
        model = AutoModelForImageTextToText.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            trust_remote_code=True,
            token=hf_token,
        ).to(device)
        print("Loaded model via AutoModelForImageTextToText.", flush=True)
    except Exception as model_load_error:
        print(f"AutoModelForImageTextToText failed; retrying AutoModelForCausalLM: {{model_load_error}}", flush=True)
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            trust_remote_code=True,
            token=hf_token,
        ).to(device)
        print("Loaded model via AutoModelForCausalLM.", flush=True)

    print("Opening reference image...", flush=True)
    image = Image.open(reference_image_path).convert("RGB")
    inputs = _prepare_inputs(processor, image, task, prompt, family, reference_image_path)

    print("Running multimodal generation...", flush=True)
    outputs = model.generate(**inputs, max_new_tokens=512)
    text = _decode_generated(processor, outputs, inputs).strip()
    print(f"Decoded output length: {{len(text)}}", flush=True)

    json_payload = _maybe_json(text) if task == "document-understanding" else None
    if json_payload is not None:
        print("HB_MULTIMODAL_JSON:" + json.dumps(json_payload, ensure_ascii=False), flush=True)
    else:
        print("HB_MULTIMODAL_TEXT:" + text, flush=True)

except Exception as e:
    print(f"Failed to execute multimodal script: {{e}}", file=sys.stderr, flush=True)
    raise
"""

    def _audio_template(self) -> str:
        pipeline_tag = (self.metadata.get("pipeline_tag") or "").lower()
        model_type = (self.metadata.get("config", {}).get("model_type") or "").lower()
        return self._metadata_header() + f"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid

import numpy as np
import soundfile as sf
import torch
from transformers import pipeline

model_id = "{self.model_id}"
pipeline_tag = "{pipeline_tag}"
model_type = "{model_type}"
hf_token = os.environ.get("HF_TOKEN") or None
hb_input = os.environ.get("HB_INPUT", "").strip()
device = 0 if torch.cuda.is_available() else -1
torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32


def _ffmpeg_executable():
    configured = os.environ.get("HB_FFMPEG_PATH", "").strip()
    if configured:
        return configured
    return shutil.which("ffmpeg")


def _normalize_audio_path(input_path: str) -> str:
    if not input_path:
        raise RuntimeError("Audio input path was empty.")
    if not os.path.isfile(input_path):
        raise RuntimeError(f"Audio input file not found: {{input_path}}")

    ffmpeg_exec = _ffmpeg_executable()
    if not ffmpeg_exec:
        print(
            "ffmpeg is required for audio normalization but was not found. "
            "Set HB_FFMPEG_PATH or bundle ffmpeg with the app.",
            file=sys.stderr,
            flush=True,
        )
        raise RuntimeError("ffmpeg not found")

    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".wav":
        try:
            info = sf.info(input_path)
            if info.samplerate == 16000 and info.channels == 1:
                print(f"Using audio input without normalization: {{input_path}}")
                return input_path
        except Exception as info_error:
            print(f"Audio probe failed, forcing normalization: {{info_error}}")

    out_path = os.path.join(tempfile.gettempdir(), f"huggingbox_audio_{{uuid.uuid4().hex}}.wav")
    cmd = [
        ffmpeg_exec,
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        out_path,
    ]
    print(f"Normalizing audio with ffmpeg: {{input_path}} -> {{out_path}}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if result.stdout.strip():
            print(result.stdout, file=sys.stderr)
        if result.stderr.strip():
            print(result.stderr, file=sys.stderr)
        raise RuntimeError("ffmpeg normalization failed")
    return out_path


def _save_audio_result(result) -> str:
    audio = None
    sampling_rate = None

    if isinstance(result, dict):
        audio = result.get("audio")
        sampling_rate = result.get("sampling_rate") or result.get("sample_rate")
    elif hasattr(result, "audio"):
        audio = getattr(result, "audio")
        sampling_rate = getattr(result, "sampling_rate", None)

    if audio is None:
        raise RuntimeError(f"Unsupported TTS output payload: {{type(result).__name__}}")
    if sampling_rate is None:
        sampling_rate = 16000

    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    elif hasattr(audio, "cpu") and hasattr(audio, "numpy"):
        audio = audio.cpu().numpy()

    out_path = os.path.abspath(os.path.join(os.getcwd(), f"tts_output_{{uuid.uuid4().hex[:8]}}.wav"))
    sf.write(out_path, audio, int(sampling_rate))
    return out_path


def _run_kokoro_tts(text: str) -> str:
    from kokoro import KPipeline

    voice = os.environ.get("HB_TTS_VOICE", "af_heart").strip() or "af_heart"
    lang_code = os.environ.get("HB_TTS_LANG_CODE", "a").strip() or "a"
    print(f"Attempting Kokoro fallback with voice={{voice}} lang_code={{lang_code}}")

    kpipeline = KPipeline(lang_code=lang_code)
    chunks = []
    for index, chunk in enumerate(kpipeline(text, voice=voice)):
        audio = chunk[2] if isinstance(chunk, tuple) and len(chunk) >= 3 else chunk
        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        elif hasattr(audio, "cpu") and hasattr(audio, "numpy"):
            audio = audio.cpu().numpy()
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        chunks.append(audio)
        print(f"Kokoro chunk {{index}} generated (samples={{audio.shape[0]}}).")

    if not chunks:
        raise RuntimeError("Kokoro fallback returned no audio chunks.")

    combined = np.concatenate(chunks)
    out_path = os.path.abspath(os.path.join(os.getcwd(), f"tts_output_{{uuid.uuid4().hex[:8]}}.wav"))
    sf.write(out_path, combined, 24000)
    return out_path


def _json_safe(value):
    if isinstance(value, dict):
        return {{str(k): _json_safe(v) for k, v in value.items()}}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


print(f"Loading audio runtime for {{model_id}}...")
print(f"Audio pipeline tag: {{pipeline_tag}}")
print(f"Input present: {{'yes' if hb_input else 'no'}}")

try:
    if pipeline_tag == "automatic-speech-recognition":
        if not hb_input:
            raise RuntimeError("ASR requires an input audio file path in HB_INPUT.")
        normalized_audio = _normalize_audio_path(hb_input)
        is_whisper = "whisper" in model_id.lower() or "whisper" in model_type or "whisper" in "{self.architecture}".lower()
        if is_whisper:
            print("Whisper-compatible model detected. Preferring ASR pipeline with timestamps.")

        asr = pipeline(
            task="automatic-speech-recognition",
            model=model_id,
            token=hf_token,
            trust_remote_code=True,
            device=device,
            torch_dtype=torch_dtype,
        )
        try:
            result = asr(normalized_audio, return_timestamps=True)
        except Exception as timestamp_error:
            print(f"Timestamps unavailable, retrying without them: {{timestamp_error}}")
            result = asr(normalized_audio)

        if isinstance(result, str):
            payload = {{"text": result}}
        elif isinstance(result, dict):
            payload = {{
                "text": result.get("text", ""),
                "chunks": result.get("chunks") or result.get("segments") or [],
            }}
        else:
            payload = {{"text": str(result)}}

        print(json.dumps(_json_safe(payload), ensure_ascii=False))

    elif pipeline_tag == "audio-classification":
        if not hb_input:
            raise RuntimeError("Audio classification requires an input audio file path in HB_INPUT.")
        normalized_audio = _normalize_audio_path(hb_input)
        classifier = pipeline(
            task="audio-classification",
            model=model_id,
            token=hf_token,
            trust_remote_code=True,
            device=device,
            torch_dtype=torch_dtype,
        )
        result = classifier(normalized_audio)
        print(json.dumps(_json_safe(result), ensure_ascii=False))

    elif pipeline_tag in ("text-to-speech", "text-to-audio"):
        if not hb_input:
            raise RuntimeError("Text-to-speech requires text input in HB_INPUT.")

        try:
            tts = pipeline(
                task="text-to-audio",
                model=model_id,
                token=hf_token,
                trust_remote_code=True,
                device=device,
                torch_dtype=torch_dtype,
            )
            print("Loaded text-to-audio pipeline.")
        except Exception as text_to_audio_error:
            print(f"text-to-audio pipeline unavailable, retrying text-to-speech: {{text_to_audio_error}}")
            try:
                tts = pipeline(
                    task="text-to-speech",
                    model=model_id,
                    token=hf_token,
                    trust_remote_code=True,
                    device=device,
                    torch_dtype=torch_dtype,
                )
                print("Loaded text-to-speech pipeline.")
                result = tts(hb_input)
                out_path = _save_audio_result(result)
            except Exception as text_to_speech_error:
                if "kokoro" in model_id.lower():
                    print(f"text-to-speech pipeline unavailable, attempting Kokoro fallback: {{text_to_speech_error}}")
                    out_path = _run_kokoro_tts(hb_input)
                else:
                    raise
        else:
            result = tts(hb_input)
            out_path = _save_audio_result(result)

        print(f"HB_OUTPUT_AUDIO:{{out_path}}")

    else:
        raise RuntimeError(f"Unsupported audio pipeline: {{pipeline_tag or 'unknown'}}")

except Exception as e:
    print(f"Failed to execute audio script: {{e}}", file=sys.stderr, flush=True)
    raise
"""

    def _llm_template(self) -> str:
        return self._metadata_header() + f"""
import os

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading LLM {{model_id}} onto {{device}}...")
try:
    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True, token=hf_token)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        trust_remote_code=True,
        token=hf_token
    ).to(device)

    user_input = os.environ.get("HB_INPUT", "").strip()
    prompt = user_input if user_input else "Explain quantum computing in one simple sentence."

    print(f"Prompt: {{prompt}}")

    def _to_device_dict(batch):
        if isinstance(batch, dict):
            return {{k: v.to(device) if hasattr(v, "to") else v for k, v in batch.items()}}
        return batch

    model_inputs = None
    try:
        messages = [{{"role": "user", "content": prompt}}]
        chat_batch = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
        chat_batch = _to_device_dict(chat_batch)
        if isinstance(chat_batch, dict) and "input_ids" in chat_batch:
            model_inputs = chat_batch
            print("Using tokenizer chat template.")
    except Exception as e:
        print(f"Chat template unavailable; falling back to plain tokenization: {{e}}")

    if model_inputs is None:
        encoded = tokenizer(prompt, return_tensors="pt")
        model_inputs = _to_device_dict(encoded)

    if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
        tokenizer.pad_token_id = tokenizer.eos_token_id

    print("Generating...")
    outputs = model.generate(
        **model_inputs,
        max_new_tokens=128,
        pad_token_id=tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id
    )

    input_length = model_inputs["input_ids"].shape[1]
    response = tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True)

    print("\\nOUTPUT:")
    print("="*40)
    print(response)
    print("="*40)
except Exception as e:
    print(f"Failed to execute LLM: {{e}}")
    raise
"""

    def _generic_template(self) -> str:
        return self._metadata_header() + f"""
import os

import torch
from transformers import pipeline

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading generic pipeline for {{model_id}}...")
try:
    pipe = pipeline(model=model_id, device=0 if device == "cuda" else -1, token=hf_token)

    print(f"Pipeline created: {{pipe.task}}")
    print("Due to lack of metadata, automatic inference cannot deduce input type.")
    print("Pipeline successfully initialized. To use it, pass appropriate inputs directly.")

except Exception as e:
    print(f"Failed to initialize generic pipeline: {{e}}")
    raise
"""
