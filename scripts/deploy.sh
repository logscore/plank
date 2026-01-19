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
    
    read -p "Enter Port [3000]: " PORT
    PORT=${PORT:-3000}

    cat > .env << EOF
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
TMDB_API_KEY=${TMDB_API_KEY}
ENABLE_FILE_STORAGE=${ENABLE_FILE_STORAGE}
PORT=${PORT}
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

    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macos"
    else
        OS="unknown"
    fi

    echo "Detected OS: $OS"

    # Function to install dependencies
    install_deps() {
        echo -e "\n${YELLOW}Installing missing dependencies...${NC}"
        
        case $OS in
            debian|ubuntu)
                echo "Using apt package manager..."
                apt-get update
                
                # Install curl if not available (needed for NodeSource)
                if ! command_exists curl; then
                    echo "Installing curl..."
                    apt-get install -y curl
                fi
                
                if ! command_exists node; then
                    echo "Installing Node.js..."
                    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
                    apt-get install -y nodejs
                fi
                
                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    apt-get install -y ffmpeg
                fi
                ;;
            fedora|rhel|centos)
                echo "Using dnf/yum package manager..."
                
                if ! command_exists node; then
                    echo "Installing Node.js..."
                    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
                    dnf install -y nodejs || yum install -y nodejs
                fi
                
                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    dnf install -y ffmpeg || yum install -y ffmpeg
                fi
                ;;
            arch|manjaro)
                echo "Using pacman package manager..."
                
                if ! command_exists node; then
                    echo "Installing Node.js..."
                    pacman -S --noconfirm nodejs npm
                fi
                
                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    pacman -S --noconfirm ffmpeg
                fi
                ;;
            alpine)
                echo "Using apk package manager..."
                
                if ! command_exists node; then
                    echo "Installing Node.js..."
                    apk add --no-cache nodejs npm
                fi
                
                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    apk add --no-cache ffmpeg
                fi
                ;;
            macos)
                if ! command_exists brew; then
                    echo -e "${RED}Homebrew is required for macOS. Install it from https://brew.sh${NC}"
                    exit 1
                fi
                
                if ! command_exists node; then
                    echo "Installing Node.js..."
                    brew install node
                fi
                
                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    brew install ffmpeg
                fi
                ;;
            *)
                echo -e "${RED}Unsupported OS. Please install Node.js and ffmpeg manually.${NC}"
                exit 1
                ;;
        esac
    }

    # Check and install dependencies
    MISSING_DEPS=false
    for cmd in node npm ffmpeg; do
        if ! command_exists $cmd; then
            echo -e "${YELLOW}$cmd is not installed.${NC}"
            MISSING_DEPS=true
        fi
    done

    if [ "$MISSING_DEPS" = true ]; then
        read -p "Would you like to install missing dependencies? (Y/n): " INSTALL_DEPS
        INSTALL_DEPS=${INSTALL_DEPS:-Y}
        
        if [[ "$INSTALL_DEPS" == "y" || "$INSTALL_DEPS" == "Y" ]]; then
            install_deps
        else
            echo -e "${RED}Cannot proceed without required dependencies.${NC}"
            exit 1
        fi
    fi

    # Verify all dependencies are now available
    for cmd in node npm ffmpeg; do
        if ! command_exists $cmd; then
            echo -e "${RED}Error: $cmd is still not available after installation attempt.${NC}"
            exit 1
        fi
    done

    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"

    setup_env

    # Load env vars for bare metal execution
    set -a
    source .env
    set +a

    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    npm install

    echo -e "\n${YELLOW}Building application...${NC}"
    npm run build

    echo -e "\n${YELLOW}Running Database Migrations...${NC}"
    npx drizzle-kit migrate

    echo -e "\n${GREEN}Build Complete!${NC}"


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
            echo "  mv $SERVICE_FILE /etc/systemd/system/"
            echo "  systemctl daemon-reload"
            echo "  systemctl enable plank"
            echo "  systemctl start plank"
        fi
    fi

    echo -e "\n${YELLOW}Would you like to start the server now?${NC}"
    server_options=("Start Production (node build)" "Start Development (npm run dev)" "Do not start now")
    select s_opt in "${server_options[@]}"
    do
        case $s_opt in
            "Start Production (node build)")
                echo -e "${GREEN}Starting production server...${NC}"
                node build
                break
                ;;
            "Start Development (npm run dev)")
                echo -e "${GREEN}Starting development server...${NC}"
                npm run dev
                break
                ;;
            "Do not start now")
                break
                ;;
            *) echo "invalid option $REPLY";;
        esac
    done
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
