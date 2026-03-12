import argparse
import sys
from typing import Dict, Any
import json
import os
import traceback

from .inspector import ModelInspector
from .runtime_router import RuntimeRouter
from .env_manager import EnvManager
from .dependency_manager import DependencyManager
from .script_generator import ScriptGenerator
from .executor import Executor

def _debug(message: str):
    if os.environ.get("HB_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}:
        print(f"[hf_auto_runner][cli] {message}", file=sys.stderr, flush=True)

def main():
    parser = argparse.ArgumentParser(description="HuggingBox Auto Runner")
    parser.add_argument("command", choices=["run", "generate"], help="Command to execute")
    parser.add_argument("model_id", help="Hugging Face Model ID (e.g., zai-org/GLM-OCR)")
    parser.add_argument("--input", dest="user_input", default="", help="User input (file path, URL, or text prompt)")
    parser.add_argument("--hf-token", dest="hf_token", default="", help="Hugging Face API token")
    
    args = parser.parse_args()

    if args.command == "run":
        run_model(args.model_id, user_input=args.user_input, hf_token=args.hf_token)
    elif args.command == "generate":
        generate_model_script(args.model_id, hf_token=args.hf_token)
    else:
        parser.print_help()
        sys.exit(1)

def run_model(model_id: str, user_input: str = "", hf_token: str = ""):
    print(f"MODEL: {model_id}")
    
    # Step 1: Fetch metadata
    inspector = ModelInspector(model_id, hf_token=hf_token or None)
    metadata = inspector.fetch_metadata()
    
    # Step 2 & 3: Detect architecture and runtime
    router = RuntimeRouter(metadata)
    architecture = router.get_architecture()
    runtime = router.get_runtime()
    
    print(f"ARCHITECTURE: {architecture}")
    print(f"RUNTIME: {runtime}")
    
    # Step 4: Create environment
    env_manager = EnvManager(model_id)
    python_exec = env_manager.create_venv()
    print("ENVIRONMENT: created")
    
    # Step 5: Install dependencies
    skip_dep_install = os.environ.get("HB_SKIP_DEP_INSTALL", "").strip().lower() in {"1", "true", "yes", "on"}
    if skip_dep_install:
        print("DEPENDENCIES: skipped")
        _debug("dependency install skipped because HB_SKIP_DEP_INSTALL is set")
    else:
        dep_manager = DependencyManager(python_exec, runtime)
        dep_manager.install_dependencies()
        print("DEPENDENCIES: installed")
    
    # Step 6 & 7: Generate inference script
    script_gen = ScriptGenerator(model_id, metadata, runtime, architecture)
    script_path = script_gen.generate_script(str(env_manager.env_dir))
    print("SCRIPT: generated")
    
    # Build extra env for the child process
    extra_env = {}
    if hf_token:
        extra_env["HF_TOKEN"] = hf_token
    if user_input:
        extra_env["HB_INPUT"] = user_input
    
    # Step 8: Execute
    executor = Executor(python_exec, script_path, extra_env=extra_env)
    success = executor.run()
    
    # Step 9: CLI output
    if success:
        print("EXECUTION: success")
    else:
        print("EXECUTION: failed")
        sys.exit(1)

def generate_model_script(model_id: str, hf_token: str = ""):
    try:
        _debug(f"generate start model_id={model_id} token={'yes' if hf_token else 'no'}")
        inspector = ModelInspector(model_id, hf_token=hf_token or None)
        metadata = inspector.fetch_metadata()
        _debug(
            "metadata fetched "
            f"files={len(metadata.get('filenames', []))} "
            f"has_config={'yes' if bool(metadata.get('config')) else 'no'}"
        )
        
        router = RuntimeRouter(metadata)
        architecture = router.get_architecture()
        runtime = router.get_runtime()
        _debug(f"routing complete architecture={architecture} runtime={runtime}")
        
        # Don't instantiate venvs or deps. Just generate the raw script logic strings.
        script_gen = ScriptGenerator(model_id, metadata, runtime, architecture)
        code = script_gen.get_raw_script()
        _debug(f"script generated chars={len(code)}")
        
        analysis = (
            f"Model {model_id} will run with a local Python script using {runtime}. "
            f"Detected architecture: {architecture}. "
            "Dependencies and environment will be managed locally."
        )
        
        result = {
            "code": code,
            "analysis": analysis
        }
        
        # Dump to stdout for Tauri IPC integration
        print(json.dumps(result))
        
    except Exception as e:
        tb = traceback.format_exc()
        _debug(f"generate failed model_id={model_id} error={e}")
        print(tb, file=sys.stderr, flush=True)
        error_result = {
            "error": str(e),
            "errorType": type(e).__name__,
            "traceback": tb,
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
