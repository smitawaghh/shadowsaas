import requests

requests.post("http://localhost:8000/api/events/ingest", json={
    "source_ip": "192.168.0.25",
    "destination_ip": "185.172.217.10",
    "source_port": 54321,
    "destination_port": 443,
    "protocol": "TCP",
    "app_name": "WeTransfer",
    "bytes_sent": 5000000,
    "bytes_received": 200,
    "upload_download_ratio": 25000.0,
    "packet_size_variance": 4500.0,
    "inter_arrival_time": 0.02
})
print("Spike event injected — check Alert Center now")
