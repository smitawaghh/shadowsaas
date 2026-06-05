import logging

logger = logging.getLogger(__name__)

class GenAIDLPEngine:
    def __init__(self):
        self.genai_indicators = [
            "chatgpt", "openai", "claude", "anthropic", "gemini",
            "bard", "copilot", "midjourney", "huggingface", "perplexity",
            "mistral", "groq", "genai",
        ]

        # Tier-2: bulk paste / exfiltration thresholds
        self.BURST_UPLOAD_MIN_BYTES = 10_000   # 10 KB (lowered from 50 KB for real traffic)
        self.BURST_UPLOAD_RATIO     = 3.0      # 3× upload > download (lowered from 5×)
        self.BURST_IAT_MAX          = 0.5      # 500 ms (loosened from 50 ms for real traffic)

    def is_genai_app(self, app_name: str) -> bool:
        lower = app_name.lower()
        return any(ind in lower for ind in self.genai_indicators)

    def analyze_event(self, event_data: dict) -> dict:
        """
        Two-tier GenAI DLP analysis:
          Tier 1 — GenAI Access: any traffic to unsanctioned GenAI endpoint
                   → is_genai_access=True, risk 65, tag "Unsanctioned GenAI Access"
          Tier 2 — Bulk Paste / Exfiltration: high upload + ratio + fast burst
                   → is_genai_exfiltration=True, risk 95, tag "Data Exfiltration Risk"
        """
        app_name      = event_data.get("app_name", "")
        bytes_sent    = event_data.get("bytes_sent", 0)
        bytes_received = event_data.get("bytes_received", 0)
        iat           = event_data.get("inter_arrival_time", 1.0)

        result = {
            "is_genai_access":       False,
            "is_genai_exfiltration": False,
            "genai_risk_score":      0.0,
            "genai_tags":            [],
        }

        if not self.is_genai_app(app_name):
            return result

        # Tier 1: GenAI access detected
        result["is_genai_access"] = True
        result["genai_risk_score"] = 65.0
        result["genai_tags"].append("Generative AI")
        result["genai_tags"].append("Unsanctioned GenAI Access")
        logger.info("GenAI access detected: %s | %d bytes sent", app_name, bytes_sent)

        # Tier 2: bulk paste / data exfiltration
        ratio = bytes_sent / max(1, bytes_received)
        if (bytes_sent > self.BURST_UPLOAD_MIN_BYTES
                and ratio > self.BURST_UPLOAD_RATIO
                and iat < self.BURST_IAT_MAX):
            logger.warning(
                "GEN-AI DLP ALERT: Bulk Paste to %s | %d B sent | ratio=%.1f | IAT=%.3fs",
                app_name, bytes_sent, ratio, iat,
            )
            result["is_genai_exfiltration"] = True
            result["genai_risk_score"] = 95.0
            result["genai_tags"].append("Data Exfiltration Risk")
            result["genai_tags"].append("Bulk Paste Detected")

        return result


_genai_engine = GenAIDLPEngine()

def get_genai_dlp_engine() -> GenAIDLPEngine:
    return _genai_engine
