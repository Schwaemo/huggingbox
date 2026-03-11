import os
from typing import Dict, Any

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
        """Returns the raw unwritten python script string directly."""
        return self._get_template()
        
    def _get_template(self) -> str:
        if self.runtime == "llama_cpp":
            return self._llama_cpp_template()
        elif self.runtime == "diffusers":
            return self._diffusers_template()
        elif self.runtime == "transformers_multimodal":
            return self._multimodal_template()
        elif self.runtime == "transformers_llm":
            return self._llm_template()
        else:
            return self._generic_template()
            
    def _llama_cpp_template(self) -> str:
        return f"""
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
        return f"""
import torch
from diffusers import DiffusionPipeline
import os

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
        return f"""
import torch
from transformers import AutoProcessor, AutoModelForImageTextToText
from PIL import Image
import urllib.request
import os

model_id = "{self.model_id}"
hf_token = os.environ.get("HF_TOKEN") or None
device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading multimodal model {{model_id}}...")

try:
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True, token=hf_token)
    model = AutoModelForImageTextToText.from_pretrained(
        model_id,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        trust_remote_code=True,
        token=hf_token
    ).to(device)

    # --- Input resolution ---
    user_input = os.environ.get("HB_INPUT", "").strip()
    
    if user_input and os.path.isfile(user_input):
        # User provided a local image path
        img_path = user_input
        print(f"Using provided image: {{img_path}}")
    elif user_input and (user_input.startswith("http://") or user_input.startswith("https://")):
        # User provided a URL
        img_path = "downloaded_input.jpg"
        print(f"Downloading user image from URL...")
        urllib.request.urlretrieve(user_input, img_path)
    else:
        # No input — use a sample image
        img_path = "sample_image.jpg"
        if not os.path.exists(img_path):
            print("No input provided — downloading sample image...")
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
    except:
        inputs = processor(images=image, text=f"<image>\\n{{prompt}}", return_tensors="pt").to(device)

    print("Generating...")
    outputs = model.generate(**inputs, max_new_tokens=128)
    
    input_len = inputs.input_ids.shape[1]
    generated_ids = outputs[0][input_len:] if outputs.shape[1] > input_len else outputs[0]
    text = processor.decode(generated_ids, skip_special_tokens=True)
    
    print("\\nOUTPUT:")
    print("="*40)
    print(text)
    print("="*40)
    
except Exception as e:
    print(f"Failed to execute multimodal script: {{e}}")
    raise
"""

    def _llm_template(self) -> str:
        return f"""
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
import os

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

    try:
        messages = [{{"role": "user", "content": prompt}}]
        inputs = tokenizer.apply_chat_template(messages, return_tensors="pt", add_generation_prompt=True).to(device)
        input_ids = inputs
    except:
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        input_ids = inputs.input_ids
        
    print("Generating...")
    outputs = model.generate(input_ids, max_new_tokens=128)
    
    input_length = input_ids.shape[1]
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
        return f"""
import torch
from transformers import pipeline
import os

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
