"""
Mock Traffic Generator — ShadowSaaS Phase 3
Simulates realistic enterprise network flows including:
  - Normal SaaS usage (Microsoft 365, Salesforce, Zoom)
  - Shadow IT uploads (Dropbox Personal, AWS S3)
  - GenAI bulk-paste exfiltration (ChatGPT, Claude)
  - Encrypted traffic with varied flow features

Run: python mock_traffic_generator.py [--count N] [--burst]
"""

import time
import random
import argparse
import requests
from datetime import datetime

try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
    HAS_COLOR = True
except ImportError:
    HAS_COLOR = False
    class Fore:
        RED = GREEN = YELLOW = CYAN = MAGENTA = WHITE = RESET = ""
    class Style:
        BRIGHT = DIM = RESET_ALL = ""

BACKEND_URL = "http://localhost:8000/api/events/ingest"

# Enterprise app definitions — each maps to real IP prefix patterns in app_signatures.json
APPS = [
    {"name": "Microsoft 365",      "ip": "13.107.6.152",    "base_risk": 10,  "category": "Sanctioned"},
    {"name": "Google Workspace",    "ip": "142.250.80.100",  "base_risk": 12,  "category": "Sanctioned"},
    {"name": "Salesforce",          "ip": "13.108.0.50",     "base_risk": 15,  "category": "Sanctioned"},
    {"name": "Zoom",                "ip": "3.7.35.50",       "base_risk": 18,  "category": "Sanctioned"},
    {"name": "Slack",               "ip": "54.172.60.10",    "base_risk": 20,  "category": "Sanctioned"},
    {"name": "ChatGPT (GenAI)",     "ip": "104.18.6.100",    "base_risk": 85,  "category": "Unsanctioned AI"},
    {"name": "Claude (GenAI)",      "ip": "104.16.130.10",   "base_risk": 80,  "category": "Unsanctioned AI"},
    {"name": "Gemini (GenAI)",      "ip": "172.217.31.10",   "base_risk": 75,  "category": "Unsanctioned AI"},
    {"name": "Dropbox (Personal)",  "ip": "162.247.243.146", "base_risk": 65,  "category": "Unsanctioned Storage"},
    {"name": "WeTransfer",          "ip": "185.172.217.10",  "base_risk": 70,  "category": "Unsanctioned Storage"},
    {"name": "AWS S3 (Shadow)",     "ip": "52.92.16.100",    "base_risk": 90,  "category": "High Risk Storage"},
    {"name": "GitHub Copilot",      "ip": "140.82.112.4",    "base_risk": 50,  "category": "Under Review AI"},
    {"name": "Pastebin",            "ip": "104.20.1.50",     "base_risk": 78,  "category": "High Risk"},
]

# Simulated internal user IPs (40 unique users)
USERS = [f"192.168.1.{i}" for i in range(10, 50)]


def generate_mock_event() -> tuple[dict, str, bool]:
    """
    Generate one simulated network flow event.

    Returns:
        (event_dict, category, is_genai_exfiltration)
    """
    app = random.choice(APPS)
    source_ip = random.choice(USERS)
    category = app["category"]

    is_genai = "GenAI" in app["name"]
    # 30% of GenAI traffic is a "bulk paste" exfiltration attempt
    is_bulk_paste = is_genai and random.random() < 0.30
    # Other risky apps have risk-proportional chance of anomalous upload
    is_risky = random.random() < (app["base_risk"] / 100)

    if is_bulk_paste:
        # Massive prompt: source code / PII pasted into LLM
        bytes_sent     = random.randint(50_000, 500_000)
        bytes_received = random.randint(500, 3_000)
        variance       = random.uniform(1_000, 5_000)
        iat            = random.uniform(0.001, 0.05)  # Burst — very fast packets
    elif is_risky:
        # Data exfiltration to shadow storage
        bytes_sent     = random.randint(500_000, 5_000_000)
        bytes_received = random.randint(100, 1_000)
        variance       = random.uniform(500, 2_500)
        iat            = random.uniform(0.01, 0.15)
    else:
        # Normal web browsing / SaaS usage
        bytes_sent     = random.randint(200, 15_000)
        bytes_received = random.randint(5_000, 150_000)
        variance       = random.uniform(10, 80)
        iat            = random.uniform(0.1, 0.6)

    bytes_received = max(1, bytes_received)
    ratio = round(bytes_sent / bytes_received, 2)

    event = {
        "source_ip":            source_ip,
        "destination_ip":       app["ip"],
        "source_port":          random.randint(1024, 65535),
        "destination_port":     random.choice([80, 443]),
        "protocol":             "TCP",
        "app_name":             app["name"],
        "bytes_sent":           bytes_sent,
        "bytes_received":       bytes_received,
        "upload_download_ratio": ratio,
        "packet_size_variance": round(variance, 2),
        "inter_arrival_time":   round(iat, 4),
    }
    return event, category, is_bulk_paste


def _color_for_risk(risk: float) -> str:
    if risk >= 70:
        return Fore.RED + Style.BRIGHT
    if risk >= 40:
        return Fore.YELLOW
    return Fore.GREEN


def run(max_events: int = 0, delay_range: tuple = (0.5, 2.0)):
    """
    Main generation loop.

    Args:
        max_events: Stop after N events (0 = run until Ctrl-C).
        delay_range: (min_s, max_s) sleep between events.
    """
    print(Fore.CYAN + Style.BRIGHT + "=" * 68)
    print(Fore.CYAN + Style.BRIGHT + "  ShadowSaaS Mock Traffic Generator — Phase 3 ETA Engine")
    print(Fore.CYAN + Style.BRIGHT + "=" * 68)
    print(f"  Backend : {BACKEND_URL}")
    print(f"  Users   : {len(USERS)} simulated IPs")
    print(f"  Apps    : {len(APPS)} applications")
    print(Style.DIM + "  Press Ctrl-C to stop\n")

    sent = 0
    errors = 0

    try:
        while True:
            event, category, is_bulk_paste = generate_mock_event()

            try:
                resp = requests.post(BACKEND_URL, json=event, timeout=5)

                if resp.status_code in (200, 201):
                    r = resp.json()
                    risk        = r.get("risk_score", 0)
                    risk_level  = r.get("risk_level", "NORMAL")
                    is_anom     = r.get("is_anomalous", False)
                    is_genai_ex = r.get("is_genai_exfiltration", False)
                    sent += 1

                    color = _color_for_risk(risk)
                    tag   = ""
                    if is_genai_ex:
                        tag = Fore.MAGENTA + Style.BRIGHT + " [GENAI-EXFIL]"
                    elif is_anom:
                        tag = Fore.RED + " [ANOMALY]"

                    line = (
                        f"{color}[#{sent:04d}] {risk:5.1f} {risk_level:<8} "
                        f"{Style.RESET_ALL}{event['app_name']:<26} "
                        f"{Style.DIM}{event['source_ip']:<15} "
                        f"^{event['bytes_sent']:>9,}B  ratio={event['upload_download_ratio']:>7.2f}  "
                        f"var={event['packet_size_variance']:>7.1f}  IAT={event['inter_arrival_time']:.3f}s"
                        f"{tag}{Style.RESET_ALL}"
                    )
                    print(line.encode(errors="replace").decode())
                else:
                    errors += 1
                    print(Fore.RED + f"[ERR] HTTP {resp.status_code}: {resp.text[:80]}")

            except requests.exceptions.ConnectionError:
                errors += 1
                print(Fore.RED + "[ERR] Cannot reach backend — is uvicorn running on :8000?")
            except Exception as exc:
                errors += 1
                print(Fore.RED + f"[ERR] {exc}")

            if max_events and sent >= max_events:
                break

            time.sleep(random.uniform(*delay_range))

    except KeyboardInterrupt:
        pass

    print(
        Fore.CYAN + f"\n{'=' * 68}\n"
        f"  Done. Sent {sent} events | {errors} errors\n"
        f"{'=' * 68}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ShadowSaaS Mock Traffic Generator")
    parser.add_argument("--count", type=int, default=0, help="Number of events (0=infinite)")
    parser.add_argument("--fast", action="store_true", help="Minimal delay (stress test)")
    args = parser.parse_args()

    delay = (0.05, 0.2) if args.fast else (0.5, 2.0)
    run(max_events=args.count, delay_range=delay)
