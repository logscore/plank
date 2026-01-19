#!/bin/bash
#
# Plank Media Server - Proxmox LXC Setup Script
# Run this script on your Proxmox host (not inside a container)
#
# Usage: bash setup-plank-lxc.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           Plank Media Server - LXC Setup Script           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    echo -e "${RED}Error: This script must be run on a Proxmox host.${NC}"
    exit 1
fi

# Get next available CT ID
read -p "Enter container ID [plank]: " CTID
CTID=${CTID:-plank}
echo -e "${YELLOW}Using Container ID: ${CTID}${NC}"

# Configuration prompts
echo ""
read -p "Enter container hostname [plank]: " HOSTNAME
HOSTNAME=${HOSTNAME:-plank}

read -p "Enter container password: " -s CT_PASSWORD
echo ""

read -p "Enter storage for container [local-lvm]: " STORAGE
STORAGE=${STORAGE:-local-lvm}

read -p "Enter disk size in GB [50]: " DISK_SIZE
DISK_SIZE=${DISK_SIZE:-50}

read -p "Enter RAM in MB [2048]: " RAM
RAM=${RAM:-2048}

read -p "Enter CPU cores [2]: " CORES
CORES=${CORES:-2}

read -p "Enter network bridge [vmbr0]: " BRIDGE
BRIDGE=${BRIDGE:-vmbr0}

read -p "Use DHCP for IP? (y/n) [y]: " USE_DHCP
USE_DHCP=${USE_DHCP:-y}

if [[ "$USE_DHCP" != "y" && "$USE_DHCP" != "Y" ]]; then
    read -p "Enter static IP (e.g., 192.168.1.100/24): " STATIC_IP
    read -p "Enter gateway IP: " GATEWAY
    NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${STATIC_IP},gw=${GATEWAY}"
else
    NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=dhcp"
fi

echo ""
echo -e "${YELLOW}=== Plank Configuration ===${NC}"
read -p "Enter your TMDB API Key (optional, press Enter to skip): " TMDB_KEY

# Generate random auth secret
AUTH_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}Generated auth secret: ${AUTH_SECRET:0:16}...${NC}"

read -p "Enter media library path on Proxmox host (optional, for bind mount): " MEDIA_PATH

# Download Debian 12 template if not exists
TEMPLATE="debian-13-standard_13.1-2_amd64.tar.zst"
TEMPLATE_PATH="/var/lib/vz/template/cache/${TEMPLATE}"

if [ ! -f "$TEMPLATE_PATH" ]; then
    echo -e "${YELLOW}Downloading Debian 12 template...${NC}"
    pveam download local $TEMPLATE
fi

echo ""
echo -e "${GREEN}Creating LXC container...${NC}"

# Create the container
pct create $CTID "local:vztmpl/${TEMPLATE}" \
    --hostname $HOSTNAME \
    --password "$CT_PASSWORD" \
    --storage $STORAGE \
    --rootfs ${STORAGE}:${DISK_SIZE} \
    --memory $RAM \
    --cores $CORES \
    --net0 $NET_CONFIG \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --start 0

# Add media bind mount if specified
if [ -n "$MEDIA_PATH" ]; then
    echo -e "${YELLOW}Adding media bind mount...${NC}"
    mkdir -p "$MEDIA_PATH"
    pct set $CTID -mp0 "${MEDIA_PATH},mp=/opt/plank/data/library"
fi

echo -e "${GREEN}Starting container...${NC}"
pct start $CTID

# Wait for container to be ready
echo -e "${YELLOW}Waiting for container to start...${NC}"
sleep 10

# Create setup script to run inside container
SETUP_SCRIPT=$(cat << 'INNERSCRIPT'
#!/bin/bash
set -e

echo "=== Updating system ==="
apt update && apt upgrade -y

echo "=== Installing dependencies ==="
apt install -y ffmpeg git curl xz-utils

echo "=== Installing Node.js 22.x ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Verify installation
node --version
npm --version

echo "=== Cloning Plank ==="
cd /opt
git clone https://github.com/logscore/plank.git
cd plank

echo "=== Installing npm packages ==="
npm install

echo "=== Building application ==="
npm run build

echo "=== Creating directories ==="
mkdir -p /opt/plank/data/library /opt/plank/data/temp /opt/plank/db

echo "=== Running database migrations ==="
npx drizzle-kit migrate

echo "=== Setup complete! ==="
INNERSCRIPT
)

echo -e "${GREEN}Running setup inside container...${NC}"
pct exec $CTID -- bash -c "$SETUP_SCRIPT"

# Create environment file
echo -e "${GREEN}Creating environment configuration...${NC}"
ENV_CONTENT="BETTER_AUTH_SECRET=${AUTH_SECRET}
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=/opt/plank/db/plank.db
DATA_PATH=/opt/plank/data"

if [ -n "$TMDB_KEY" ]; then
    ENV_CONTENT="${ENV_CONTENT}
TMDB_API_KEY=${TMDB_KEY}"
fi

pct exec $CTID -- bash -c "cat > /opt/plank/.env << 'EOF'
${ENV_CONTENT}
EOF"

# Create systemd service
echo -e "${GREEN}Creating systemd service...${NC}"
SERVICE_CONTENT='[Unit]
Description=Plank Media Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/plank
EnvironmentFile=/opt/plank/.env
ExecStart=/usr/bin/node build
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target'

pct exec $CTID -- bash -c "cat > /etc/systemd/system/plank.service << 'EOF'
${SERVICE_CONTENT}
EOF"

# Enable and start service
pct exec $CTID -- systemctl daemon-reload
pct exec $CTID -- systemctl enable plank
pct exec $CTID -- systemctl start plank

# Get container IP
sleep 3
CT_IP=$(pct exec $CTID -- hostname -I | awk '{print $1}')

# Update BETTER_AUTH_URL with actual IP
pct exec $CTID -- sed -i "s|http://localhost:3000|http://${CT_IP}:3000|g" /opt/plank/.env
pct exec $CTID -- systemctl restart plank

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 Setup Complete!                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Container ID:    ${YELLOW}${CTID}${NC}"
echo -e "Container IP:    ${YELLOW}${CT_IP}${NC}"
echo -e "Web Interface:   ${GREEN}http://${CT_IP}:3000${NC}"
echo ""
echo -e "Auth Secret:     ${YELLOW}${AUTH_SECRET}${NC}"
echo -e "${RED}(Save this secret! You'll need it if you redeploy)${NC}"
echo ""
echo -e "To view logs:    ${YELLOW}pct exec ${CTID} -- journalctl -u plank -f${NC}"
echo -e "To restart:      ${YELLOW}pct exec ${CTID} -- systemctl restart plank${NC}"
echo -e "To enter shell:  ${YELLOW}pct enter ${CTID}${NC}"
echo ""
