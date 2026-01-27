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

# Function to run commands with sudo if not root
run_privileged() {
    if [ "$EUID" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

# Repository URL
REPO_URL="https://github.com/logscore/plank.git"
INSTALL_DIR="plank"

# Function to clone or update repository
clone_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}Directory '$INSTALL_DIR' already exists.${NC}"
        read -p "Update existing installation? (Y/n): " UPDATE_REPO
        UPDATE_REPO=${UPDATE_REPO:-Y}

        if [[ "$UPDATE_REPO" == "y" || "$UPDATE_REPO" == "Y" ]]; then
            echo "Updating repository..."
            cd "$INSTALL_DIR"
            git pull
        else
            cd "$INSTALL_DIR"
        fi
    else
        echo "Cloning Plank repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    echo -e "${GREEN}Repository ready at: $(pwd)${NC}"
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

    # Use absolute path for database
    DEFAULT_DB_PATH="$(pwd)/plank.db"
    DEFAULT_DATA_PATH="$(pwd)/data"

    # Database
    DATABASE_URL=$DEFAULT_DB_PATH

    # Data path for downloads
    DATA_PATH=$DEFAULT_DATA_PATH

    # TMDB API Key
    read -p "Enter TMDB API Key (get yours at https://www.themoviedb.org/settings/api): " TMDB_API_KEY

    # Generate random secret for authentication
    BETTER_AUTH_SECRET=$(openssl rand -hex 32)
    echo -e "Generated auth secret: ${GREEN}${BETTER_AUTH_SECRET:0:16}...${NC}"

    read -p "Enter Base URL [http://localhost:3300]: " BETTER_AUTH_URL
    BETTER_AUTH_URL=${BETTER_AUTH_URL:-http://localhost:3300}

    # File storage
    read -p "Enable File Storage? (true/false) [true]: " ENABLE_FILE_STORAGE
    ENABLE_FILE_STORAGE=${ENABLE_FILE_STORAGE:-true}

    # Port
    read -p "Enter Port [3300]: " PORT
    PORT=${PORT:-3300}

    cat > .env << EOF
DATABASE_URL=${DATABASE_URL}
DATA_PATH=${DATA_PATH}
TMDB_API_KEY=${TMDB_API_KEY}

# Prowlarr/FlareSolverr (auto-configured for Docker, API key extracted automatically)
PROWLARR_URL=http://prowlarr:9696
PROWLARR_API_KEY=
FLARESOLVERR_URL=http://flaresolverr:8191

BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=${BETTER_AUTH_URL}
ENABLE_FILE_STORAGE=${ENABLE_FILE_STORAGE}
PORT=${PORT}
ORIGIN=${BETTER_AUTH_URL}
EOF

    echo -e "${GREEN}.env file created successfully!${NC}"
}

deploy_docker() {
    echo -e "\n${YELLOW}=== Docker Deployment ===${NC}"

    # Detect OS for package installation
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macos"
    else
        OS="unknown"
    fi

    echo "Detected OS: $OS"

    # Install missing dependencies
    MISSING_DOCKER_DEPS=false
    for cmd in git docker; do
        if ! command_exists $cmd; then
            echo -e "${YELLOW}$cmd is not installed.${NC}"
            MISSING_DOCKER_DEPS=true
        fi
    done

    if [ "$MISSING_DOCKER_DEPS" = true ]; then
        read -p "Would you like to install missing dependencies? (Y/n): " INSTALL_DEPS
        INSTALL_DEPS=${INSTALL_DEPS:-Y}

        if [[ "$INSTALL_DEPS" == "y" || "$INSTALL_DEPS" == "Y" ]]; then
            case $OS in
                debian|ubuntu)
                    echo "Using apt package manager..."
                    run_privileged apt-get update

                    if ! command_exists git; then
                        echo "Installing git..."
                        run_privileged apt-get install -y git
                    fi

                    if ! command_exists curl; then
                        echo "Installing curl..."
                        run_privileged apt-get install -y curl
                    fi

                    if ! command_exists docker; then
                        echo "Installing Docker..."
                        # Download script first, then execute (better error handling)
                        DOCKER_SCRIPT=$(mktemp)
                        if curl -fsSL https://get.docker.com -o "$DOCKER_SCRIPT"; then
                            run_privileged sh "$DOCKER_SCRIPT"
                            rm -f "$DOCKER_SCRIPT"

                            # Verify docker installed before enabling service
                            if command_exists docker; then
                                run_privileged systemctl enable docker
                                run_privileged systemctl start docker
                                run_privileged usermod -aG docker "$USER"
                                echo -e "${YELLOW}Added $USER to docker group. You may need to log out and back in, or run 'newgrp docker'.${NC}"
                            else
                                echo -e "${RED}Docker installation failed. Please install manually.${NC}"
                                exit 1
                            fi
                        else
                            rm -f "$DOCKER_SCRIPT"
                            echo -e "${RED}Failed to download Docker install script. Check your internet connection.${NC}"
                            exit 1
                        fi
                    fi
                    ;;
                fedora|rhel|centos)
                    echo "Using dnf/yum package manager..."

                    if ! command_exists git; then
                        echo "Installing git..."
                        run_privileged dnf install -y git || run_privileged yum install -y git
                    fi

                    if ! command_exists docker; then
                        echo "Installing Docker..."
                        curl -fsSL https://get.docker.com | run_privileged sh
                        run_privileged systemctl enable docker
                        run_privileged systemctl start docker
                        run_privileged usermod -aG docker "$USER"
                        echo -e "${YELLOW}Added $USER to docker group. You may need to log out and back in, or run 'newgrp docker'.${NC}"
                    fi
                    ;;
                arch|manjaro)
                    echo "Using pacman package manager..."

                    if ! command_exists git; then
                        echo "Installing git..."
                        run_privileged pacman -S --noconfirm git
                    fi

                    if ! command_exists docker; then
                        echo "Installing Docker..."
                        run_privileged pacman -S --noconfirm docker
                        run_privileged systemctl enable docker
                        run_privileged systemctl start docker
                        run_privileged usermod -aG docker "$USER"
                        echo -e "${YELLOW}Added $USER to docker group. You may need to log out and back in, or run 'newgrp docker'.${NC}"
                    fi
                    ;;
                alpine)
                    echo "Using apk package manager..."

                    if ! command_exists git; then
                        echo "Installing git..."
                        run_privileged apk add --no-cache git
                    fi

                    if ! command_exists docker; then
                        echo "Installing Docker..."
                        run_privileged apk add --no-cache docker
                        run_privileged rc-update add docker boot
                        run_privileged service docker start
                        run_privileged addgroup "$USER" docker
                        echo -e "${YELLOW}Added $USER to docker group. You may need to log out and back in.${NC}"
                    fi
                    ;;
                macos)
                    echo -e "${RED}Please install Docker Desktop from https://docker.com/products/docker-desktop${NC}"
                    exit 1
                    ;;
                *)
                    echo -e "${RED}Unsupported OS. Please install git and Docker manually.${NC}"
                    exit 1
                    ;;
            esac
        else
            echo -e "${RED}Cannot proceed without required dependencies.${NC}"
            exit 1
        fi
    fi

    # Verify dependencies
    for cmd in git docker; do
        if ! command_exists $cmd; then
            echo -e "${RED}Error: $cmd is still not available.${NC}"
            exit 1
        fi
    done

    clone_repo
    setup_env

    # Load env vars to ensure they are available for Docker Compose interpolation
    set -a
    source .env
    set +a

    echo "Starting Docker Compose..."

    # Try without sudo first, fall back to sudo if permission denied
    if docker compose -f docker/docker-compose.yml up -d --build 2>/dev/null; then
        :
    else
        echo -e "${YELLOW}Retrying with sudo (you may need to re-login for docker group)...${NC}"
        run_privileged docker compose -f docker/docker-compose.yml up -d --build
    fi

    echo -e "\n${GREEN}Deployment Complete!${NC}"
    echo -e "Access Plank at: ${GREEN}${BETTER_AUTH_URL}${NC} (or your server IP)"
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
                run_privileged apt-get update

                if ! command_exists git; then
                    echo "Installing git..."
                    run_privileged apt-get install -y git
                fi

                if ! command_exists curl; then
                    echo "Installing curl..."
                    run_privileged apt-get install -y curl
                fi

                if ! command_exists node; then
                    echo "Installing Node.js..."
                    curl -fsSL https://deb.nodesource.com/setup_22.x | run_privileged bash -
                    run_privileged apt-get install -y nodejs
                fi

                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    run_privileged apt-get install -y ffmpeg
                fi
                ;;
            fedora|rhel|centos)
                echo "Using dnf/yum package manager..."

                if ! command_exists git; then
                    echo "Installing git..."
                    run_privileged dnf install -y git || run_privileged yum install -y git
                fi

                if ! command_exists node; then
                    echo "Installing Node.js..."
                    curl -fsSL https://rpm.nodesource.com/setup_22.x | run_privileged bash -
                    run_privileged dnf install -y nodejs || run_privileged yum install -y nodejs
                fi

                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    run_privileged dnf install -y ffmpeg || run_privileged yum install -y ffmpeg
                fi
                ;;
            arch|manjaro)
                echo "Using pacman package manager..."

                if ! command_exists git; then
                    echo "Installing git..."
                    run_privileged pacman -S --noconfirm git
                fi

                if ! command_exists node; then
                    echo "Installing Node.js..."
                    run_privileged pacman -S --noconfirm nodejs npm
                fi

                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    run_privileged pacman -S --noconfirm ffmpeg
                fi
                ;;
            alpine)
                echo "Using apk package manager..."

                if ! command_exists git; then
                    echo "Installing git..."
                    run_privileged apk add --no-cache git
                fi

                if ! command_exists node; then
                    echo "Installing Node.js..."
                    run_privileged apk add --no-cache nodejs npm
                fi

                if ! command_exists ffmpeg; then
                    echo "Installing ffmpeg..."
                    run_privileged apk add --no-cache ffmpeg
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
    for cmd in git node npm ffmpeg; do
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
    for cmd in node npm ffmpeg git; do
        if ! command_exists $cmd; then
            echo -e "${RED}Error: $cmd is still not available after installation attempt.${NC}"
            exit 1
        fi
    done

    echo "Node version: $(node -v)"
    echo "NPM version: $(npm -v)"

    clone_repo
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

    echo -e "\n${YELLOW}How would you like to run the server?${NC}"

    # Check if systemd is available
    if [ -d "/etc/systemd/system" ]; then
        server_options=("Install as systemd service (recommended)" "Start foreground (node build)" "Start development (npm run dev)" "Do not start now")
    else
        server_options=("Start foreground (node build)" "Start development (npm run dev)" "Do not start now")
    fi

    select s_opt in "${server_options[@]}"
    do
        case $s_opt in
            "Install as systemd service (recommended)")
                echo -e "${GREEN}Installing systemd service...${NC}"

                SERVICE_FILE="/etc/systemd/system/plank.service"
                CURRENT_USER=$(whoami)
                WORKDIR=$(pwd)
                NODE_PATH=$(which node)
                NPX_PATH=$(which npx)

                run_privileged tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Plank Media Server
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$WORKDIR
ExecStartPre=$NPX_PATH drizzle-kit migrate
ExecStart=$NODE_PATH build
Restart=on-failure
RestartSec=5
EnvironmentFile=$WORKDIR/.env

[Install]
WantedBy=multi-user.target
EOF

                run_privileged systemctl daemon-reload
                run_privileged systemctl enable plank
                run_privileged systemctl start plank

                echo -e "\n${GREEN}Plank service installed and started!${NC}"
                echo -e "Service status: $(systemctl is-active plank)"
                echo ""
                echo "Useful commands:"
                echo "  systemctl status plank   - Check status"
                echo "  systemctl stop plank     - Stop server"
                echo "  systemctl restart plank  - Restart server"
                echo "  journalctl -u plank -f   - View logs"
                break
                ;;
            "Start foreground (node build)")
                echo -e "${GREEN}Starting production server in foreground...${NC}"
                echo "Press Ctrl+C to stop"
                node build
                break
                ;;
            "Start development (npm run dev)")
                echo -e "${GREEN}Starting development server...${NC}"
                npm run dev
                break
                ;;
            "Do not start now")
                echo -e "${YELLOW}Server not started. To start manually:${NC}"
                echo "  node build              - Production"
                echo "  npm run dev             - Development"
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
