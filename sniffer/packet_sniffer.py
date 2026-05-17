"""
ShadowSaaS Live Packet Sniffer — Phase 3 ETA Engine
Requires: Npcap (installed via Wireshark) + Admin / elevated privileges

Run as administrator:
    python packet_sniffer.py
    python packet_sniffer.py --iface "Wi-Fi"
    python packet_sniffer.py --iface "Wi-Fi" --all-devices   ← promiscuous, all network devices
    python packet_sniffer.py --iface "Wi-Fi" --debug

Detection pipeline:
  1. ARP table scan → discovers every device on the LAN (IP, MAC, hostname)
  2. Preload Windows DNS cache → instant identification for live connections
  3. Sniff DNS responses → extend ip→hostname cache as new connections open
  4. Parse TLS ClientHello raw bytes → extract SNI without needing Scapy TLS layer
  5. Extract HTTP Host header → identify port-80 services
  6. Identify SaaS app (SNI → DNS cache → IP prefix → async rDNS)
  7. Every FLOW_WINDOW packets: compute ETA features and POST to backend
"""

import sys
import json
import time
import os
import socket
import argparse
import logging
import subprocess
import concurrent.futures
from collections import defaultdict

import numpy as np
import requests

try:
    from scapy.all import sniff, IP, TCP, UDP, Raw, ARP
    try:
        from scapy.layers.dns import DNS, DNSRR
        DNS_SUPPORT = True
    except ImportError:
        DNS_SUPPORT = False
    TLS_LAYER_SUPPORT = False
    try:
        from scapy.layers.tls.all import TLSClientHello
        from scapy.layers.tls.extensions import TLS_Ext_ServerName
        TLS_LAYER_SUPPORT = True
    except ImportError:
        pass
except ImportError:
    print("ERROR: scapy not installed.  Run: pip install scapy")
    sys.exit(1)

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("sniffer")

# ── Config ─────────────────────────────────────────────────────────────────
FLOW_WINDOW = 5
PRIVATE_PREFIXES = (
    "192.168.", "10.",
    "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
    "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
    "172.28.", "172.29.", "172.30.", "172.31.",
)

# ── Ingest auth header ─────────────────────────────────────────────────────
# Set SNIFFER_API_KEY in sniffer/.env (or environment) to match the backend key.
# Leave empty to run without auth (dev mode only).
_SNIFFER_API_KEY = os.environ.get("SNIFFER_API_KEY", "")
_INGEST_HEADERS  = {"X-Sniffer-Key": _SNIFFER_API_KEY} if _SNIFFER_API_KEY else {}

# ── Load app signatures ────────────────────────────────────────────────────
_sig_path = os.path.join(os.path.dirname(__file__), "app_signatures.json")
try:
    with open(_sig_path) as f:
        _sigs = json.load(f)
    SNI_SIGNATURES: dict = _sigs.get("sni_keywords", _sigs)
    IP_SIGNATURES:  dict = _sigs.get("ip_prefixes", {})
    logger.info(f"Loaded {len(SNI_SIGNATURES)} SNI keywords + {len(IP_SIGNATURES)} IP prefixes")
except FileNotFoundError:
    SNI_SIGNATURES = {}
    IP_SIGNATURES  = {}
    logger.warning("app_signatures.json not found — all traffic will show as 'Unknown SaaS'")

# ── Device registry (ARP-discovered) ──────────────────────────────────────
# ip → { mac, hostname, vendor }
_device_registry: dict[str, dict] = {}

# OUI → vendor name (first 3 octets of MAC)
_OUI_MAP = {
    "00:50:56": "VMware",   "00:0c:29": "VMware",
    "08:00:27": "VirtualBox",
    "b8:27:eb": "Raspberry Pi", "dc:a6:32": "Raspberry Pi",
    "00:1a:11": "Google",   "54:60:09": "Google",
    "ac:bc:32": "Apple",    "f0:18:98": "Apple",    "3c:06:30": "Apple",
    "00:1b:63": "Apple",    "a4:c3:f0": "Apple",    "00:17:f2": "Apple",
    "74:40:bb": "Samsung",  "f4:f5:e8": "Samsung",
    "00:16:3e": "Xen",
    "00:1e:67": "Dell",     "18:66:da": "Dell",
    "e4:11:5b": "HP",       "b0:5a:da": "Intel",
    "00:e0:4c": "Realtek",
}


def _oui_vendor(mac: str) -> str:
    prefix = mac[:8].lower().replace("-", ":")
    for oui, vendor in _OUI_MAP.items():
        if prefix.startswith(oui):
            return vendor
    return ""


def _scan_arp_table() -> int:
    """
    Parse the OS ARP table to build _device_registry.
    Works on Windows (`arp -a`) — discovers every device the machine has
    communicated with on the LAN since last boot.
    """
    try:
        result = subprocess.run(
            ["arp", "-a"], capture_output=True, text=True, timeout=5, encoding="utf-8", errors="ignore"
        )
        count = 0
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 2:
                continue
            ip = parts[0].strip()
            if not any(ip.startswith(p) for p in PRIVATE_PREFIXES):
                continue
            # Windows: "  192.168.0.1    00-11-22-33-44-55    dynamic"
            # Linux:   "192.168.0.1 ether 00:11:22:33:44:55   C  eth0"
            mac_raw = ""
            for p in parts[1:]:
                if "-" in p or (p.count(":") == 5):
                    mac_raw = p.replace("-", ":").lower()
                    break
            vendor = _oui_vendor(mac_raw) if mac_raw else ""
            _device_registry[ip] = {
                "mac": mac_raw,
                "hostname": ip,        # will be enriched by _resolve_device_name
                "vendor": vendor,
            }
            count += 1
        return count
    except Exception as exc:
        logger.debug(f"ARP scan failed: {exc}")
        return 0


def _resolve_device_name(ip: str) -> None:
    """
    Background thread: try multiple methods to get a human-readable device name.
      1. Reverse DNS  (works for most devices)
      2. NetBIOS / nbtstat  (Windows-to-Windows, very reliable on home LANs)
    Updates _device_registry[ip]["hostname"] in place.
    """
    hostname = ip
    # Method 1: reverse DNS
    try:
        hostname = socket.gethostbyaddr(ip)[0]
    except Exception:
        pass

    # Method 2: NetBIOS (Windows only, best for identifying Windows PCs by name)
    if hostname == ip and sys.platform == "win32":
        try:
            res = subprocess.run(
                ["nbtstat", "-A", ip],
                capture_output=True, text=True, timeout=4,
                encoding="utf-8", errors="ignore",
            )
            for line in res.stdout.splitlines():
                # Look for <00> UNIQUE — that's the workstation name
                if "<00>" in line and "UNIQUE" in line:
                    nb_name = line.split()[0].strip()
                    if nb_name:
                        hostname = nb_name
                        break
        except Exception:
            pass

    if ip in _device_registry:
        _device_registry[ip]["hostname"] = hostname
    logger.debug(f"Device {ip} → {hostname}")


# ── DNS resolution cache ───────────────────────────────────────────────────
_dns_cache:   dict[str, str] = {}
_dns_pending: set[str]       = set()
_dns_failed:  set[str]       = set()
_rdns_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=8, thread_name_prefix="rdns"
)


def _preload_windows_dns_cache() -> int:
    """Parse ipconfig /displaydns to pre-populate the dns cache."""
    if sys.platform != "win32":
        return 0
    try:
        result = subprocess.run(
            ["ipconfig", "/displaydns"],
            capture_output=True, text=True, timeout=10,
            encoding="utf-8", errors="ignore",
        )
        current_name = ""
        count = 0
        for line in result.stdout.splitlines():
            line = line.strip()
            if "Record Name" in line and ":" in line:
                current_name = line.split(":", 1)[1].strip().rstrip(".")
            elif "A (Host) Record" in line and ":" in line:
                ip = line.split(":", 1)[1].strip()
                if ip and current_name and not any(ip.startswith(p) for p in PRIVATE_PREFIXES):
                    if ip not in _dns_cache:
                        _dns_cache[ip] = current_name
                        count += 1
        if count:
            logger.info(f"Pre-populated {count} entries from Windows DNS cache")
        return count
    except Exception as exc:
        logger.debug(f"ipconfig /displaydns failed: {exc}")
        return 0


def _rdns_lookup(ip: str) -> None:
    """Reverse DNS in a background thread — never blocks the capture loop."""
    try:
        hostname = socket.gethostbyaddr(ip)[0]
        _dns_cache[ip] = hostname
        logger.debug(f"rDNS {ip} → {hostname}")
    except Exception:
        _dns_failed.add(ip)
    finally:
        _dns_pending.discard(ip)


def _process_dns_packet(packet) -> None:
    """Extract A records from DNS responses to grow the ip→hostname cache."""
    if not DNS_SUPPORT or DNS not in packet:
        return
    dns = packet[DNS]
    if dns.qr != 1 or dns.ancount == 0:
        return
    try:
        rr = dns.an
        while rr is not None and hasattr(rr, "rrname"):
            if getattr(rr, "type", None) == 1:  # A record
                ip   = rr.rdata
                name = rr.rrname
                if isinstance(name, bytes):
                    name = name.decode("utf-8", errors="ignore").rstrip(".")
                if isinstance(ip, bytes):
                    ip = ip.decode("utf-8", errors="ignore")
                if ip and name and not any(ip.startswith(p) for p in PRIVATE_PREFIXES):
                    if ip not in _dns_cache:
                        _dns_cache[ip] = name
                        app = _identify_app(ip, sni=name)
                        logger.info(f"DNS  {ip:<18} → {name}  [{app}]")
            payload = getattr(rr, "payload", None)
            rr = payload if hasattr(payload, "rrname") else None
    except Exception:
        pass


# ── Raw TLS SNI extraction (no Scapy TLS layer needed) ────────────────────

def _extract_sni_raw(payload: bytes) -> str:
    """Parse SNI from raw TLS ClientHello bytes — works when TLS_LAYER_SUPPORT=False."""
    try:
        if len(payload) < 44 or payload[0] != 0x16 or payload[5] != 0x01:
            return ""
        idx = 43
        session_id_len = payload[idx]; idx += 1 + session_id_len
        if idx + 2 > len(payload): return ""
        cs_len = int.from_bytes(payload[idx:idx+2], "big"); idx += 2 + cs_len
        if idx + 1 > len(payload): return ""
        cm_len = payload[idx]; idx += 1 + cm_len
        if idx + 2 > len(payload): return ""
        ext_total = int.from_bytes(payload[idx:idx+2], "big"); idx += 2
        ext_end = idx + ext_total
        while idx + 4 <= ext_end and idx + 4 <= len(payload):
            ext_type = int.from_bytes(payload[idx:idx+2], "big")
            ext_len  = int.from_bytes(payload[idx+2:idx+4], "big")
            idx += 4
            if ext_type == 0x0000 and idx + 5 <= len(payload):
                name_len = int.from_bytes(payload[idx+3:idx+5], "big")
                if idx + 5 + name_len <= len(payload):
                    return payload[idx+5:idx+5+name_len].decode("utf-8", errors="ignore")
            idx += ext_len
    except Exception:
        pass
    return ""


def _extract_http_host(payload: bytes) -> str:
    """Extract Host header from an HTTP/1.x request."""
    try:
        text = payload[:2048].decode("utf-8", errors="ignore")
        if not any(text.startswith(m) for m in ("GET ", "POST ", "PUT ", "HEAD ", "CONNECT ")):
            return ""
        for line in text.splitlines()[1:]:
            if line.lower().startswith("host:"):
                return line.split(":", 1)[1].strip().split(":")[0].lower()
    except Exception:
        pass
    return ""


# ── SaaS identification ────────────────────────────────────────────────────

def _sni_matches(hostname: str, keyword: str) -> bool:
    return hostname == keyword or hostname.endswith("." + keyword)


def _identify_app(dst_ip: str, sni: str = "") -> str:
    if sni:
        sni_lower = sni.lower()
        for keyword, app_name in SNI_SIGNATURES.items():
            if _sni_matches(sni_lower, keyword):
                return app_name
        # SNI present but not in catalog — show the actual domain name
        # Strip leading "www." for cleaner display
        display = sni_lower.removeprefix("www.")
        _dns_cache[dst_ip] = display  # also cache for future packets
        return display
    cached = _dns_cache.get(dst_ip, "")
    if cached:
        cached_lower = cached.lower()
        for keyword, app_name in SNI_SIGNATURES.items():
            if _sni_matches(cached_lower, keyword):
                return app_name
        return cached
    for prefix, app_name in IP_SIGNATURES.items():
        if dst_ip.startswith(prefix):
            return app_name
    if dst_ip not in _dns_cache and dst_ip not in _dns_pending and dst_ip not in _dns_failed:
        _dns_pending.add(dst_ip)
        _rdns_pool.submit(_rdns_lookup, dst_ip)
    return "Unknown SaaS"


# ── ML model ───────────────────────────────────────────────────────────────
_backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.normpath(_backend_path))

try:
    from app.ml.model import detector as _detector
    ML_READY = _detector.model is not None
    logger.info(f"Isolation Forest loaded — ML_READY={ML_READY}")
except Exception as exc:
    _detector = None
    ML_READY  = False
    logger.warning(f"ML model not loaded: {exc}. Using threshold fallback.")


def _predict(upload_ratio: float, variance: float, iat: float) -> tuple[bool, float]:
    if ML_READY and _detector is not None:
        return _detector.predict(upload_ratio, variance, iat)
    is_anom = upload_ratio > 5.0 and variance > 500
    return is_anom, 85.0 if is_anom else 10.0


# ── Flow tracker ───────────────────────────────────────────────────────────
_flows: dict = defaultdict(lambda: {
    "bytes_sent":          0,
    "bytes_received":      0,
    "packet_sizes":        [],
    "inter_arrival_times": [],
    "last_packet_time":    0.0,
    "sni":                 "",
})


def _process_packet(backend_url: str, packet) -> None:
    if IP not in packet:
        return

    src_ip = packet[IP].src
    dst_ip = packet[IP].dst
    protocol = "TCP" if TCP in packet else ("UDP" if UDP in packet else None)
    if protocol is None:
        return

    src_port = packet[TCP].sport if TCP in packet else packet[UDP].sport
    dst_port = packet[TCP].dport if TCP in packet else packet[UDP].dport

    if src_port == 53 or dst_port == 53:
        return

    # ── SNI / Host extraction ──────────────────────────────────────────────
    sni = ""
    if protocol == "TCP" and Raw in packet:
        raw_bytes = bytes(packet[Raw].load)
        if dst_port in (443, 8443):
            if TLS_LAYER_SUPPORT:
                try:
                    if packet.haslayer(TLSClientHello) and packet.haslayer(TLS_Ext_ServerName):
                        ext = packet[TLS_Ext_ServerName]
                        if ext.servernames:
                            sni = ext.servernames[0].servername.decode("utf-8", errors="ignore")
                except Exception:
                    pass
            if not sni:
                sni = _extract_sni_raw(raw_bytes)
        elif dst_port == 80:
            sni = _extract_http_host(raw_bytes)

    # ── Flow key: always (local_ip, remote_ip, local_port, remote_port) ───
    src_is_private = any(src_ip.startswith(p) for p in PRIVATE_PREFIXES)
    dst_is_private = any(dst_ip.startswith(p) for p in PRIVATE_PREFIXES)

    if src_is_private and not dst_is_private:
        flow_key  = (src_ip, dst_ip, src_port, dst_port, protocol)
        direction = "outbound"
    elif dst_is_private and not src_is_private:
        flow_key  = (dst_ip, src_ip, dst_port, src_port, protocol)
        direction = "inbound"
    else:
        return   # LAN-to-LAN or both external — skip

    pkt_len = len(packet)
    now     = time.monotonic()
    flow    = _flows[flow_key]

    if direction == "outbound":
        flow["bytes_sent"]     += pkt_len
    else:
        flow["bytes_received"] += pkt_len

    flow["packet_sizes"].append(pkt_len)
    if flow["last_packet_time"]:
        flow["inter_arrival_times"].append(now - flow["last_packet_time"])
    flow["last_packet_time"] = now

    if sni and not flow["sni"]:
        flow["sni"] = sni
        _dns_cache[flow_key[1]] = sni

    if len(flow["packet_sizes"]) < FLOW_WINDOW:
        return

    # ── ETA features ──────────────────────────────────────────────────────
    bytes_recv   = max(1, flow["bytes_received"])
    upload_ratio = round(flow["bytes_sent"] / bytes_recv, 2)
    variance     = round(float(np.var(flow["packet_sizes"])), 2) if len(flow["packet_sizes"]) > 1 else 0.0
    avg_iat      = round(float(np.mean(flow["inter_arrival_times"])), 4) if flow["inter_arrival_times"] else 0.0

    is_anomalous, risk_score = _predict(upload_ratio, variance, avg_iat)
    app_name = _identify_app(flow_key[1], sni=flow["sni"])

    local_ip = flow_key[0]
    device   = _device_registry.get(local_ip, {})

    payload = {
        "source_ip":             local_ip,
        "destination_ip":        flow_key[1],
        "source_port":           flow_key[2],
        "destination_port":      flow_key[3],
        "protocol":              flow_key[4],
        "app_name":              app_name,
        "bytes_sent":            flow["bytes_sent"],
        "bytes_received":        flow["bytes_received"],
        "upload_download_ratio": upload_ratio,
        "packet_size_variance":  variance,
        "inter_arrival_time":    avg_iat,
        # Device identity — real hostnames/MACs from ARP+NetBIOS
        "device_name":           device.get("hostname") or None,
        "mac_address":           device.get("mac") or None,
    }

    try:
        requests.post(backend_url, json=payload, timeout=2, headers=_INGEST_HEADERS)
        flag = "ANOMALY" if is_anomalous else "ok   "
        label = device.get("hostname", local_ip)
        logger.info(
            f"[{flag}] {label:<22} → {app_name:<35} "
            f"risk={risk_score:.0f}  ratio={upload_ratio}  port={flow_key[3]}"
        )
    except requests.exceptions.RequestException as exc:
        logger.warning(f"Backend unreachable: {exc}")

    flow["packet_sizes"]        = []
    flow["inter_arrival_times"] = []
    flow["bytes_sent"]          = 0
    flow["bytes_received"]      = 0


def main():
    parser = argparse.ArgumentParser(description="ShadowSaaS Packet Sniffer")
    parser.add_argument("--iface",       default=None,
                        help="Network interface (default: all)")
    parser.add_argument("--backend",     default="http://localhost:8000/api/events/ingest",
                        help="Backend ingest URL")
    parser.add_argument("--all-devices", action="store_true",
                        help="Enable promiscuous mode to monitor ALL devices on the network")
    parser.add_argument("--debug",       action="store_true",
                        help="Enable DEBUG logging")
    args = parser.parse_args()

    if args.debug:
        logging.getLogger("sniffer").setLevel(logging.DEBUG)

    logger.info("=" * 65)
    logger.info("  ShadowSaaS Packet Sniffer")
    logger.info(f"  Interface    : {args.iface or 'all'}")
    logger.info(f"  Backend      : {args.backend}")
    logger.info(f"  All-devices  : {args.all_devices} (promiscuous mode)")
    logger.info(f"  ML ready     : {ML_READY}")
    logger.info(f"  TLS layer    : {TLS_LAYER_SUPPORT}  (raw-byte parser: always ON)")
    logger.info(f"  DNS sniff    : {DNS_SUPPORT}")
    logger.info(f"  SNI rules    : {len(SNI_SIGNATURES)}")
    logger.info(f"  IP rules     : {len(IP_SIGNATURES)}")
    logger.info(f"  Flow window  : {FLOW_WINDOW} packets")
    logger.info("  Requires     : Npcap + Administrator")
    logger.info("=" * 65)

    # ── Device discovery ──────────────────────────────────────────────────
    arp_count = _scan_arp_table()
    logger.info(f"ARP scan found {arp_count} LAN devices")
    for ip, dev in list(_device_registry.items()):
        _rdns_pool.submit(_resolve_device_name, ip)
        logger.info(f"  Device  {ip:<18} MAC={dev['mac'] or '?':17}  vendor={dev['vendor'] or 'unknown'}")

    # ── Windows DNS cache preload ─────────────────────────────────────────
    _preload_windows_dns_cache()

    def _cb(pkt):
        if IP not in pkt:
            return
        if UDP in pkt and (pkt[UDP].sport == 53 or pkt[UDP].dport == 53):
            _process_dns_packet(pkt)
        else:
            _process_packet(args.backend, pkt)

    logger.info("Capturing... (Ctrl+C to stop)")
    try:
        sniff(
            iface=args.iface,
            prn=_cb,
            store=False,
            filter="ip",
            promisc=args.all_devices,   # True = see all WiFi devices, False = own traffic only
        )
    except PermissionError:
        logger.error("Permission denied — run as Administrator.")
    except OSError as exc:
        logger.error(f"Interface error: {exc}")
        logger.error("Install Wireshark (with Npcap) and run as Administrator.")
    finally:
        _rdns_pool.shutdown(wait=False)


if __name__ == "__main__":
    main()
