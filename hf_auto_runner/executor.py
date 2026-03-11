import subprocess
import sys
import os

class Executor:
    def __init__(self, python_exec: str, script_path: str, extra_env: dict | None = None):
        self.python_exec = python_exec
        self.script_path = script_path
        self.extra_env = extra_env or {}
        
    def run(self) -> bool:
        cmd = [self.python_exec, self.script_path]

        # Merge caller-supplied env vars on top of the current process env so the
        # generated script can see HF_TOKEN, HB_INPUT, CUDA settings, etc.
        env = os.environ.copy()
        env.update(self.extra_env)
        
        try:
            # Stream output live to the CLI
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                env=env,
            )
            
            for line in process.stdout:
                print(line, end="")
                
            process.wait()
            
            if process.returncode != 0:
                print(f"Process failed with exit code {process.returncode}")
                return False
                
            return True
            
        except Exception as e:
            print(f"Execution failed: {e}")
            return False
