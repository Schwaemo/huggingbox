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
        return self._metadata_header() + f"""
import os
import torch
from diffusers import DiffusionPipeline

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None

print(f"Loading diffusion model {{model_id}}...")
try:
    pipe = DiffusionPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        use_safetensors=True,
        token=hf_token
    )
    pipe = pipe.to("cuda" if torch.cuda.is_available() else "cpu")

    user_input = os.environ.get("HB_INPUT", "").strip()
    prompt = user_input if user_input else "A beautiful sunset over a cyberpunk city"

    print(f"Generating image for prompt: '{{prompt}}'")
    image = pipe(prompt, num_inference_steps=20).images[0]
    out_path = os.path.abspath("output.png")
    image.save(out_path)
    print(f"Success! Image saved to {{out_path}}")

except Exception as e:
    print(f"Failed to run diffusion model: {{e}}")
    raise
"""

    def _multimodal_template(self) -> str:
        return self._metadata_header() + f"""
import base64
import os
import re
import tempfile
import urllib.request
import uuid

import torch
from PIL import Image
from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoProcessor

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading multimodal model {{model_id}}...")

try:
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True, token=hf_token)
    model = None
    try:
        model = AutoModelForImageTextToText.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            trust_remote_code=True,
            token=hf_token
        ).to(device)
        print("Loaded model via AutoModelForImageTextToText.")
    except Exception as model_load_error:
        print(f"AutoModelForImageTextToText failed, falling back to AutoModelForCausalLM: {{model_load_error}}")
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            trust_remote_code=True,
            token=hf_token
        ).to(device)
        print("Loaded model via AutoModelForCausalLM.")

    runtime_input_dir = os.path.join(tempfile.gettempdir(), "huggingbox_inputs")
    os.makedirs(runtime_input_dir, exist_ok=True)
    run_suffix = uuid.uuid4().hex[:8]

    user_input = os.environ.get("HB_INPUT", "").strip()
    if user_input.startswith("__HBIMG__:"):
        user_input = user_input[len("__HBIMG__:"):].strip()

    if user_input and os.path.isfile(user_input):
        img_path = user_input
        print(f"Using provided image: {{img_path}}")
    elif user_input and user_input.startswith("data:image/"):
        match = re.match(r"^data:image/([^;]+);base64,(.+)$", user_input, flags=re.DOTALL)
        if not match:
            raise RuntimeError("Invalid image data URL format in HB_INPUT.")
        ext = match.group(1).lower().replace("jpeg", "jpg")
        payload = match.group(2)
        img_path = os.path.join(runtime_input_dir, f"user_input_{{run_suffix}}.{{ext}}")
        with open(img_path, "wb") as f:
            f.write(base64.b64decode(payload))
        print(f"Decoded image input to: {{img_path}}")
    elif user_input and (user_input.startswith("http://") or user_input.startswith("https://")):
        img_path = os.path.join(runtime_input_dir, f"downloaded_input_{{run_suffix}}.jpg")
        print("Downloading user image from URL...")
        urllib.request.urlretrieve(user_input, img_path)
    else:
        img_path = os.path.join(runtime_input_dir, "sample_image.jpg")
        if not os.path.exists(img_path):
            print("No input provided -> downloading sample image...")
            urllib.request.urlretrieve("https://picsum.photos/id/237/500/500", img_path)
        else:
            print("Using cached sample image.")

    image = Image.open(img_path).convert("RGB")
    prompt = "Describe this image in detail."

    messages = [
        {{"role": "user", "content": [
            {{"type": "image", "image": img_path}},
            {{"type": "text", "text": prompt}}
        ]}}
    ]

    try:
        text = processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = processor(images=image, text=text, return_tensors="pt").to(device)
    except Exception:
        inputs = processor(images=image, text=f"<image>\\n{{prompt}}", return_tensors="pt").to(device)

    print("Generating...")
    outputs = model.generate(**inputs, max_new_tokens=128)

    input_ids = None
    if isinstance(inputs, dict):
        input_ids = inputs.get("input_ids")
    elif hasattr(inputs, "input_ids"):
        input_ids = inputs.input_ids

    if input_ids is not None and hasattr(input_ids, "shape") and len(input_ids.shape) > 1:
        input_len = input_ids.shape[1]
        generated_ids = outputs[0][input_len:] if outputs.shape[1] > input_len else outputs[0]
    else:
        generated_ids = outputs[0]
    text = processor.decode(generated_ids, skip_special_tokens=True)

    print("\\nOUTPUT:")
    print("="*40)
    print(text)
    print("="*40)

except Exception as e:
    print(f"Failed to execute multimodal script: {{e}}")
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
