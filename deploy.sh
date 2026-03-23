#!/bin/bash
# Automated deployment script for Ledger Reconciliation API
# Run on Ubuntu EC2: curl -sSL https://raw.githubusercontent.com/shrishtechx/reconciliation/main/deploy.sh | bash

set -e

echo "=========================================="
echo "  Ledger Reconciliation API Deployment"
echo "=========================================="

# Update system
echo "[1/8] Updating system..."
sudo apt update && sudo apt upgrade -y

# Install dependencies
echo "[2/8] Installing dependencies..."
sudo apt install -y python3.11 python3.11-venv python3-pip git nginx
sudo apt install -y default-jre-headless  # For PDF extraction
sudo apt install -y default-libmysqlclient-dev pkg-config build-essential

# Clone repository
echo "[3/8] Cloning repository..."
cd /home/ubuntu
if [ -d "reconciliation" ]; then
    cd reconciliation && git pull
else
    git clone https://github.com/shrishtechx/reconciliation.git
    cd reconciliation
fi

# Setup Python environment
echo "[4/8] Setting up Python environment..."
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt python-dotenv gunicorn

# Create .env if not exists
echo "[5/8] Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo "Creating default .env file..."
    cat > .env << 'EOF'
# Database - Empty DB_HOST uses SQLite
DB_HOST=
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=Ledger_Reconsile

# OpenAI API Key (set this!)
OPENAI_API_KEY=
EOF
    echo "⚠️  Please edit /home/ubuntu/reconciliation/backend/.env to add your OPENAI_API_KEY"
fi

# Create systemd service
echo "[6/8] Creating systemd service..."
sudo tee /etc/systemd/system/ledger-api.service > /dev/null << 'EOF'
[Unit]
Description=Ledger Reconciliation API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/reconciliation/backend
Environment="PATH=/home/ubuntu/reconciliation/backend/venv/bin"
ExecStart=/home/ubuntu/reconciliation/backend/venv/bin/gunicorn server:app -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ledger-api
sudo systemctl restart ledger-api

# Configure Nginx
echo "[7/8] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/ledger-api > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/ledger-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Get public IP
echo "[8/8] Deployment complete!"
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")

echo ""
echo "=========================================="
echo "  ✅ Deployment Successful!"
echo "=========================================="
echo ""
echo "API URL: http://$PUBLIC_IP"
echo "Health Check: http://$PUBLIC_IP/api/health"
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano /home/ubuntu/reconciliation/backend/.env"
echo "2. Add your OPENAI_API_KEY"
echo "3. Restart: sudo systemctl restart ledger-api"
echo ""
echo "Useful commands:"
echo "  View logs: sudo journalctl -u ledger-api -f"
echo "  Restart: sudo systemctl restart ledger-api"
echo "  Update: cd ~/reconciliation && git pull && sudo systemctl restart ledger-api"
echo ""
