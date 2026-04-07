import os
import subprocess
import sys
from typing import List

HF_TRANSFORMERS_GIT_URL = "git+https://github.com/huggingface/transformers.git"

# PyTorch CUDA 12.1 index — provides CUDA-linked wheels for torch/torchvision/torchaudio.
# Falls back to CPU silently if no NVIDIA GPU is present; safe to install on any machine.
TORCH_CUDA_INDEX_URL = "https://download.pytorch.org/whl/cu121"

# llama-cpp-python CUDA 12.1 pre-built wheels (community mirror by abetlen).
LLAMA_CPP_CUDA_INDEX_URL = "https://abetlen.github.io/llama-cpp-python/whl/cu121"

_TORCH_PKGS = {"torch", "torchvision", "torchaudio"}


class DependencyManager:
    def __init__(self, python_exec: str, runtime: str):
        self.python_exec = python_exec
        self.runtime = runtime

    def get_dependencies(self) -> List[str]:
        if self.runtime == "llama_cpp":
            return ["llama-cpp-python", "huggingface_hub"]

        if self.runtime == "diffusers":
            return ["diffusers", "transformers", "accelerate", "torch", "torchvision", "pillow"]

        if self.runtime == "onnxruntime":
            return ["optimum", "onnxruntime", "transformers", "torch", "pillow"]

        if self.runtime == "transformers_llm":
            return ["transformers", "accelerate", "torch", "sentencepiece"]

        if self.runtime == "transformers_multimodal":
            return [
                "transformers",
                "accelerate",
                "torch",
                "torchvision",
                "pillow",
                "pymupdf",
                "sentencepiece",
                "qwen-vl-utils",
                "einops",
                "requests",
                "matplotlib",
                "addict",
            ]

        if self.runtime == "transformers_audio":
            return ["transformers", "accelerate", "torch", "librosa", "soundfile", "sentencepiece"]

        # Generic transformers fallback
        return ["transformers", "accelerate", "torch", "sentencepiece", "pillow"]

    def install_dependencies(self):
        if self.runtime == "llama_cpp":
            self._install_llama_cpp()
            self._run_pip(["huggingface_hub", "hf_transfer"])
            return

        deps = self.get_dependencies()
        torch_pkgs = [d for d in deps if d in _TORCH_PKGS]
        other_deps = [d for d in deps if d not in _TORCH_PKGS]

        if torch_pkgs:
            self._install_torch_cuda(torch_pkgs)

        normalized: List[str] = []
        for dep in other_deps:
            if dep.strip().lower().startswith("transformers"):
                normalized.append(HF_TRANSFORMERS_GIT_URL)
            else:
                normalized.append(dep)
        normalized.append("hf_transfer")
        self._run_pip(normalized)

    # ── Private helpers ──────────────────────────────────────────────────────

    def _install_llama_cpp(self):
        """Install llama-cpp-python from the CUDA 12.1 pre-built wheel index."""
        try:
            self._run_pip(
                ["llama-cpp-python"],
                extra_index_url=LLAMA_CPP_CUDA_INDEX_URL,
            )
        except SystemExit:
            # Pre-built wheel unavailable for this Python version — fall back to
            # the plain CPU wheel so the run still succeeds (GPU layers will be 0).
            print(
                "[HuggingBox] CUDA wheel not found for this Python version; "
                "installing CPU llama-cpp-python.",
                flush=True,
            )
            self._run_pip(["llama-cpp-python"])

    def _install_torch_cuda(self, pkgs: List[str]):
        """Install the torch family from the PyTorch CUDA 12.1 index."""
        cmd = [
            self.python_exec, "-m", "pip", "install", "--upgrade",
            "--index-url", TORCH_CUDA_INDEX_URL,
        ] + pkgs
        self._exec(cmd)

    def _run_pip(self, pkgs: List[str], extra_index_url: str | None = None):
        if not pkgs:
            return
        cmd = [self.python_exec, "-m", "pip", "install", "--upgrade"] + pkgs
        if extra_index_url:
            cmd += ["--extra-index-url", extra_index_url]
        self._exec(cmd)

    def _exec(self, cmd: List[str]):
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"Failed to install dependencies: {e.stderr}", flush=True)
            sys.exit(1)
