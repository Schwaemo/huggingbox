import subprocess
import sys
from typing import List

HF_TRANSFORMERS_GIT_URL = "git+https://github.com/huggingface/transformers.git"

class DependencyManager:
    def __init__(self, python_exec: str, runtime: str):
        self.python_exec = python_exec
        self.runtime = runtime
        
    def get_dependencies(self) -> List[str]:
        if self.runtime == "llama_cpp":
            return ["llama-cpp-python", "huggingface_hub"]
            
        if self.runtime == "diffusers":
            return ["diffusers", "transformers", "accelerate", "torch", "torchvision", "pillow"]
            
        if self.runtime == "transformers_llm":
            return ["transformers", "accelerate", "torch", "sentencepiece"]
            
        if self.runtime == "transformers_multimodal":
            return [
                "transformers",
                "accelerate",
                "torch",
                "torchvision",
                "pillow",
                "sentencepiece",
                "qwen-vl-utils",
                "einops",
                "requests",
                "matplotlib",
                "addict",
            ]
            
        if self.runtime == "transformers_audio":
            return ["transformers", "accelerate", "torch", "librosa", "soundfile"]
            
        # Generic transformers fallback
        return ["transformers", "accelerate", "torch", "sentencepiece", "pillow"]

    def install_dependencies(self):
        deps = self.get_dependencies()
        if not deps:
            return

        normalized_deps: List[str] = []
        for dep in deps:
            if dep.strip().lower().startswith("transformers"):
                normalized_deps.append(HF_TRANSFORMERS_GIT_URL)
            else:
                normalized_deps.append(dep)
            
        cmd = [self.python_exec, "-m", "pip", "install", "--upgrade"] + normalized_deps
        # Also ensure HF transfer is available for faster downloads if requested
        cmd.append("hf_transfer")
        
        try:
            # Hide output unless it fails
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"Failed to install dependencies: {e.stderr}")
            sys.exit(1)
