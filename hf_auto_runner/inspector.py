from huggingface_hub import HfApi, hf_hub_download
import json
import os
from typing import Dict, Any, List

class ModelInspector:
    def __init__(self, model_id: str, hf_token: str | None = None):
        self.model_id = model_id
        self.hf_token = hf_token or os.environ.get("HF_TOKEN") or None
        self.api = HfApi(token=self.hf_token)

    def fetch_metadata(self) -> Dict[str, Any]:
        """Fetches config.json and lists repository files."""
        try:
            info = self.api.model_info(self.model_id)
            filenames = [sib.rfilename for sib in info.siblings]
        except Exception as e:
            raise RuntimeError(f"Failed to fetch model info for {self.model_id}: {e}")

        config = {}
        if "config.json" in filenames:
            try:
                config_path = hf_hub_download(
                    repo_id=self.model_id,
                    filename="config.json",
                    token=self.hf_token,
                )
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            except Exception as e:
                print(f"Warning: Could not download config.json: {e}")
        
        return {
            "model_id": self.model_id,
            "filenames": filenames,
            "config": config,
            "has_processor": "processor_config.json" in filenames or "preprocessor_config.json" in filenames,
            "has_tokenizer": "tokenizer.json" in filenames or "tokenizer_config.json" in filenames
        }
