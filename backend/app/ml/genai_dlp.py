import logging

logger = logging.getLogger(__name__)

class GenAIDLPEngine:
    def __init__(self):
        # Known LLM / GenAI domains and IP indicators
        self.genai_indicators = [
            "chatgpt", "openai", "claude", "anthropic", "gemini", 
            "bard", "copilot", "midjourney", "huggingface"
        ]
        
        # Thresholds for detecting Bulk Data Pasting
        self.BURST_UPLOAD_MIN_BYTES = 50000  # 50 KB minimum for a paste burst
        self.BURST_UPLOAD_RATIO = 5.0        # Upload must be 5x larger than download
        self.BURST_IAT_MAX = 0.05            # Inter-arrival time must be very fast (milliseconds)

    def is_genai_app(self, app_name: str) -> bool:
        app_lower = app_name.lower()
        return any(indicator in app_lower for indicator in self.genai_indicators)

    def analyze_event(self, event_data: dict) -> dict:
        """
        Analyzes a network event specifically for GenAI Exfiltration anomalies.
        Returns a dict with flags and contextual reasons.
        """
        app_name = event_data.get('app_name', '')
        bytes_sent = event_data.get('bytes_sent', 0)
        bytes_received = event_data.get('bytes_received', 0)
        iat = event_data.get('inter_arrival_time', 1.0)
        
        result = {
            "is_genai_exfiltration": False,
            "genai_risk_score": 0.0,
            "genai_tags": []
        }
        
        if not self.is_genai_app(app_name):
            return result
            
        result["genai_tags"].append("Generative AI")
        
        # Calculate ratio safely
        ratio = bytes_sent / max(1, bytes_received)
        
        # Evaluate heuristics for bulk pasting
        if bytes_sent > self.BURST_UPLOAD_MIN_BYTES and ratio > self.BURST_UPLOAD_RATIO and iat < self.BURST_IAT_MAX:
            logger.warning(f"🚨 GEN-AI DLP ALERT: Bulk Paste Detected to {app_name} | {bytes_sent} bytes sent in {iat}s")
            result["is_genai_exfiltration"] = True
            result["genai_risk_score"] = 95.0
            result["genai_tags"].append("Data Exfiltration Risk")
            result["genai_tags"].append("Prompt Injection")
            
        return result

# Singleton instance
_genai_engine = GenAIDLPEngine()

def get_genai_dlp_engine() -> GenAIDLPEngine:
    return _genai_engine
