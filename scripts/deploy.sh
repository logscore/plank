#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║             Plank Media Server - Deployment               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to prompt for environment variables
setup_env() {
    echo -e "\n${YELLOW}=== Configuration ===${NC}"
    
    if [ -f .env ]; then
        echo -e "${YELLOW}Found existing .env file. Skipping generation unless you want to overwrite.${NC}"
        read -p "Overwrite existing .env? (y/N): " OVERWRITE
        if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
            return
        fi
    fi

    echo "Generating .env file..."
    
    # Generate random secret
    BETTER_AUTH_SECRET=$(openssl rand -hex 32)
    echo -e "Generated auth secret: ${GREEN}${BETTER_AUTH_SECRET:0:16}...${NC}"

    read -p "Enter TMDB API Key (optional): " TMDB_API_KEY
    read -p "Enter Base URL (e.g., http://localhost:3000): " BETTER_AUTH_URL
    BETTER_AUTH_URL=${BETTER_AUTH_URL:-http://localhost:3000}
    
    read -p "Enable File Storage (for uploads)? (true/false) [true]: " ENABLE_FILE_STORAGE
    ENABLE_FILE_STORAGE=${ENABLE_FILE_STORAGE:-true}

    cat > .env << EOF
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
TMDB_API_KEY=${TMDB_API_KEY}
ENABLE_FILE_STORAGE=${ENABLE_FILE_STORAGE}
DATABASE_URL=file:./plank.db
EOF
# Note: DATABASE_URL might need adjustment for Docker vs Bare Metal, handled in docker-compose usually, but good to have base

    echo -e "${GREEN}.env file created successfully!${NC}"
}

deploy_docker() {
    echo -e "\n${YELLOW}=== Docker Deployment ===${NC}"
    
    if ! command_exists docker; then
        echo -e "${RED}Error: docker is not installed.${NC}"
        exit 1
    fi

    setup_env

    # Load env vars to ensure they are available for Docker Compose interpolation
    set -a
    source .env
    set +a

    echo "Starting Docker Compose..."
    # Explicitly pass .env file to ensure variables are picked up
    docker compose -f docker/docker-compose.selfhosted.yml up -d --build

    echo -e "\n${GREEN}Deployment Complete!${NC}"
    echo -e "Access Plank at: ${GREEN}http://localhost:3300${NC} (or your server IP)"
}

deploy_bare_metal() {
    echo -e "\n${YELLOW}=== Bare Metal Deployment ===${NC}"

    # Check dependencies
    for cmd in node npm ffmpeg; do
        if ! command_exists $cmd; then
            echo -e "${RED}Error: $cmd is not installed.${NC}"
            exit 1
        fi
    done

    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"

    setup_env

    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    npm install

    echo -e "\n${YELLOW}Building application...${NC}"
    npm run build

    echo -e "\n${YELLOW}Running Database Migrations...${NC}"
    npx drizzle-kit migrate

    echo -e "\n${GREEN}Build Complete!${NC}"
    echo "You can run the server using: npm run dev (dev) or node build (prod)"

    # Systemd Service Offer
    if [ -d "/etc/systemd/system" ]; then
        echo -e "\n${YELLOW}Would you like to generate a systemd service file? (Linux only)${NC}"
        read -p "(y/n) [y]: " GEN_SERVICE
        GEN_SERVICE=${GEN_SERVICE:-y}

        if [[ "$GEN_SERVICE" == "y" || "$GEN_SERVICE" == "Y" ]]; then
            SERVICE_FILE="plank.service"
            USER=$(whoami)
            WORKDIR=$(pwd)
            NODE_PATH=$(which node)

            cat > $SERVICE_FILE << EOF
[Unit]
Description=Plank Media Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR
ExecStart=$NODE_PATH build
Restart=on-failure
EnvironmentFile=$WORKDIR/.env

[Install]
WantedBy=multi-user.target
EOF
            echo -e "${GREEN}Service file '$SERVICE_FILE' generated!${NC}"
            echo "To install:"
            echo "  sudo mv $SERVICE_FILE /etc/systemd/system/"
            echo "  sudo systemctl daemon-reload"
            echo "  sudo systemctl enable plank"
            echo "  sudo systemctl start plank"
        fi
    fi
}

# Main Menu
PS3='Please enter your choice: '
options=("Deploy with Docker" "Deploy Bare Metal" "Quit")
select opt in "${options[@]}"
do
    case $opt in
        "Deploy with Docker")
            deploy_docker
            break
            ;;
        "Deploy Bare Metal")
            deploy_bare_metal
            break
            ;;
        "Quit")
            break
            ;;
        *) echo "invalid option $REPLY";;
    esac
done
