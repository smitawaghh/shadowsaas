#!/bin/bash
# ShadowSaaS — AWS EC2 Amazon Linux 2023 setup script
#
# HOW TO USE:
#   1. Launch EC2 t2.micro (Amazon Linux 2023), download the .pem key
#   2. Open port 8000 and 80 in the Security Group (inbound rules)
#   3. SSH in:  ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
#   4. Upload this file: scp -i your-key.pem deploy/ec2_userdata.sh ec2-user@<EC2_PUBLIC_IP>:~/
#   5. On the instance: chmod +x ec2_userdata.sh && sudo ./ec2_userdata.sh
#
# FILL IN before running:
GITHUB_REPO="https://github.com/smitawaghh/shadowsaas.git"   # your GitHub repo URL
MONGODB_URL="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/shadowsaas"

set -e   # stop on any error

echo "==> [1/7] Updating system packages"
yum update -y
yum install -y python3.11 python3.11-pip git nginx

echo "==> [2/7] Cloning repo"
cd /home/ec2-user
git clone "$GITHUB_REPO" shadowsaas
cd shadowsaas/backend

echo "==> [3/7] Creating Python virtual environment"
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "==> [4/7] Writing .env config"
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
cat > .env <<EOF
MONGODB_URL=$MONGODB_URL
SECRET_KEY=$SECRET
NOTIFY_THRESHOLD=75.0
EVENT_RETENTION_DAYS=90
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
EOF

echo "==> [5/7] Creating systemd service (auto-restart on crash + reboot)"
cat > /etc/systemd/system/shadowsaas.service <<EOF
[Unit]
Description=ShadowSaaS FastAPI backend
After=network.target

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/shadowsaas/backend
EnvironmentFile=/home/ec2-user/shadowsaas/backend/.env
ExecStart=/home/ec2-user/shadowsaas/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable shadowsaas
systemctl start shadowsaas

echo "==> [6/7] Configuring Nginx reverse proxy (port 80 → 8000)"
cat > /etc/nginx/conf.d/shadowsaas.conf <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
EOF

systemctl enable nginx
systemctl restart nginx

echo "==> [7/7] Verifying deployment"
sleep 3
curl -sf http://localhost/api/health && echo "" || echo "WARNING: health check failed — check: journalctl -u shadowsaas -n 50"

echo ""
echo "========================================"
echo "  ShadowSaaS deployed successfully"
echo "  Health: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api/health"
echo "========================================"
