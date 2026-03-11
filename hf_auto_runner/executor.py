import subprocess
import sys

class Executor:
    def __init__(self, python_exec: str, script_path: str):
        self.python_exec = python_exec
        self.script_path = script_path
        
    def run(self) -> bool:
        cmd = [self.python_exec, self.script_path]
        
        try:
            # Stream output live to the CLI
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True
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
