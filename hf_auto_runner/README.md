# HuggingBox Auto Runner

This directory contains the `hf_auto_runner` Python scripts, which use deterministic local inspections to automatically execute Hugging Face models.

## Usage

```bash
python -m hf_auto_runner.cli run zai-org/GLM-OCR
```

The system will:
1. Fetch metadata `config.json` via the hugging face API
2. Use string matching algorithms to determine the architecture
3. Provision an isolated virtual environment and fetch PIP dependencies
4. Embed a standalone script that utilizes exactly the dependencies required
5. Provide a CLI trace output log of stdout
