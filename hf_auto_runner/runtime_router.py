from typing import Dict, Any

class RuntimeRouter:
    def __init__(self, metadata: Dict[str, Any]):
        self.metadata = metadata
        self.config = metadata.get("config", {})
        self.filenames = metadata.get("filenames", [])
        self.pipeline_tag = (metadata.get("pipeline_tag") or "").lower()
        
    def get_architecture(self) -> str:
        architectures = self.config.get("architectures", [])
        if architectures:
            return architectures[0]
        
        # Fallback to model_type if architectures list is missing
        model_type = self.config.get("model_type", "unknown")
        return f"{model_type.capitalize()}Model"
        
    def get_runtime(self) -> str:
        # Check for GGUF first 
        if any(f.endswith(".gguf") for f in self.filenames):
            return "llama_cpp"
            
        model_type = self.config.get("model_type", "").lower()
        architectures = self.config.get("architectures", [])
        arch_string = "".join(architectures).lower()
        
        if "diffusion" in model_type or "diffusion" in arch_string:
            return "diffusers"

        # Prioritize multimodal/OCR families before generic CausalLM routing.
        if (
            "imagetexttotext" in arch_string
            or "ocr" in arch_string
            or model_type in ["llava", "qwen2_vl", "paligemma", "glm", "deepseek_vl_v2"]
        ):
            return "transformers_multimodal"

        if self.pipeline_tag in {
            "automatic-speech-recognition",
            "audio-classification",
            "text-to-speech",
            "text-to-audio",
        }:
            return "transformers_audio"
            
        if "causallm" in arch_string or model_type in ["llama", "mistral", "gemma", "qwen2", "phi"]:
            return "transformers_llm"
            
        if "speech" in arch_string or "whisper" in model_type:
            return "transformers_audio"
            
        # Default fallback
        return "transformers_generic"
