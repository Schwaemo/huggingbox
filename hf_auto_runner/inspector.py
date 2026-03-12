from huggingface_hub import HfApi, hf_hub_download
import json
import os
import sys
from typing import Dict, Any, List


def _debug(message: str) -> None:
    if os.environ.get("HB_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}:
        print(f"[hf_auto_runner][inspector] {message}", file=sys.stderr, flush=True)

class ModelInspector:
    def __init__(self, model_id: str, hf_token: str | None = None):
        self.model_id = model_id
        self.hf_token = hf_token or os.environ.get("HF_TOKEN") or None
        self.api = HfApi(token=self.hf_token)

    def fetch_metadata(self) -> Dict[str, Any]:
        """Fetches config.json and lists repository files."""
        _debug(f"Fetching model info for {self.model_id} (token={'yes' if self.hf_token else 'no'})")
        try:
            info = self.api.model_info(self.model_id)
            filenames = [sib.rfilename for sib in info.siblings]
            _debug(f"Model info loaded. siblings={len(filenames)}")
        except Exception as e:
            raise RuntimeError(f"Failed to fetch model info for {self.model_id}: {e}")

        config = {}
        if "config.json" in filenames:
            try:
                _debug("Downloading config.json")
                config_path = hf_hub_download(
                    repo_id=self.model_id,
                    filename="config.json",
                    token=self.hf_token,
                )
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                _debug("config.json loaded successfully")
            except Exception as e:
                print(f"Warning: Could not download config.json: {e}", file=sys.stderr, flush=True)
        else:
            _debug("config.json not present in repository")
        
        return {
            "model_id": self.model_id,
            "filenames": filenames,
            "config": config,
            "pipeline_tag": getattr(info, "pipeline_tag", None),
            "has_processor": "processor_config.json" in filenames or "preprocessor_config.json" in filenames,
            "has_tokenizer": "tokenizer.json" in filenames or "tokenizer_config.json" in filenames
        }
