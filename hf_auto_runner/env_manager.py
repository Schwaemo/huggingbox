import os
import venv
import sys
from pathlib import Path

class EnvManager:
    def __init__(self, model_id: str):
        self.model_id = model_id.replace("/", "_")
        # Store envs in a hidden directory in the project root
        self.envs_base_dir = Path(os.getcwd()) / ".hf_envs"
        self.env_dir = self.envs_base_dir / self.model_id
        
    def create_venv(self) -> str:
        """Creates a virtual environment and returns the path to the python executable."""
        self.envs_base_dir.mkdir(exist_ok=True, parents=True)
        
        if not self.env_dir.exists():
            print(f"Creating virtual environment for {self.model_id}...")
            venv.create(self.env_dir, with_pip=True)
            
        if sys.platform == "win32":
            return str(self.env_dir / "Scripts" / "python.exe")
        return str(self.env_dir / "bin" / "python")
