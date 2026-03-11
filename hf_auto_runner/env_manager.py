import os
import venv
import sys
from pathlib import Path

class EnvManager:
    def __init__(self, model_id: str):
        self.model_id = model_id

        # Tauri passes HB_VENV_DIR = the exact path for this model's venv.
        # This ensures Python and Rust operate on the same directory.
        hb_venv_dir = os.environ.get("HB_VENV_DIR", "").strip()
        if hb_venv_dir:
            self.env_dir = Path(hb_venv_dir)
            self.envs_base_dir = self.env_dir.parent
            return

        # If only a root is provided, derive the model subfolder.
        hb_venv_root = os.environ.get("HB_VENV_ROOT", "").strip()
        if hb_venv_root:
            slug = model_id.replace("/", os.sep)
            self.envs_base_dir = Path(hb_venv_root)
            self.env_dir = self.envs_base_dir / slug
            return

        # Fallback: cwd/.hf_envs (original behaviour, used when running CLI directly)
        slug_flat = model_id.replace("/", "_")
        self.envs_base_dir = Path(os.getcwd()) / ".hf_envs"
        self.env_dir = self.envs_base_dir / slug_flat

    def create_venv(self) -> str:
        """Creates a virtual environment and returns the path to the python executable."""
        self.env_dir.mkdir(exist_ok=True, parents=True)

        if not (self.env_dir / ("Scripts" if sys.platform == "win32" else "bin")).exists():
            print(f"Creating virtual environment at {self.env_dir}...")
            venv.create(self.env_dir, with_pip=True)

        if sys.platform == "win32":
            return str(self.env_dir / "Scripts" / "python.exe")
        return str(self.env_dir / "bin" / "python")
