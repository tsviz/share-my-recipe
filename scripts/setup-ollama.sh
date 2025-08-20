#!/bin/bash
# Setup and manage Ollama for Share My Recipe
# This script handles Homebrew Ollama service management, model management, and testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration from .env file
# Try to read from .env if it exists
if [ -f ".env" ]; then
    # Source the .env file but only extract the values we need
    OLLAMA_PORT=$(grep "^LLM_SERVICE_URL=" .env | cut -d':' -f3 | sed 's/[^0-9]//g')
    OLLAMA_MODEL=$(grep "^OLLAMA_MODEL=" .env | cut -d'=' -f2)
    LLM_CONTAINERIZED=$(grep "^LLM_CONTAINERIZED=" .env | cut -d'=' -f2)
fi

# Default values if not found in .env
OLLAMA_PORT=${OLLAMA_PORT:-11434}
OLLAMA_MODEL=${OLLAMA_MODEL:-mistral}
LLM_CONTAINERIZED=${LLM_CONTAINERIZED:-false}
SERVICE_NAME="ollama"

# Function to show usage
show_usage() {
    echo -e "${CYAN}🔧 Ollama Setup Script for Share My Recipe${NC}"
    echo -e "${CYAN}============================================${NC}\n"
    
    echo -e "${GREEN}USAGE:${NC}"
    echo -e "  ${YELLOW}./scripts/setup-ollama.sh${NC} [COMMAND]\n"
    
    echo -e "${GREEN}COMMANDS:${NC}"
    echo -e "  ${YELLOW}(no args)${NC}     Full setup - start service, pull model, and test"
    echo -e "  ${YELLOW}start${NC}        Start Ollama service"
    echo -e "  ${YELLOW}stop${NC}         Stop Ollama service"
    echo -e "  ${YELLOW}restart${NC}      Restart Ollama service"
    echo -e "  ${YELLOW}status${NC}       Show service status and configuration"
    echo -e "  ${YELLOW}logs${NC}         Follow service logs (Ctrl+C to exit)"
    echo -e "  ${YELLOW}pull${NC}         Pull/update the configured model"
    echo -e "  ${YELLOW}test${NC}         Test Ollama API connection"
    echo -e "  ${YELLOW}models${NC}       List installed models"
    echo -e "  ${YELLOW}install${NC}      Install Ollama via Homebrew"
    echo -e "  ${YELLOW}port${NC}         Check port usage and conflicts"
    echo -e "  ${YELLOW}help${NC}         Show this usage information\n"
    
    echo -e "${GREEN}EXAMPLES:${NC}"
    echo -e "  ${BLUE}# Full setup (recommended for first run)${NC}"
    echo -e "  ./scripts/setup-ollama.sh\n"
    
    echo -e "  ${BLUE}# Quick start if already configured${NC}"
    echo -e "  ./scripts/setup-ollama.sh start\n"
    
    echo -e "  ${BLUE}# Check if everything is working${NC}"
    echo -e "  ./scripts/setup-ollama.sh status\n"
    
    echo -e "  ${BLUE}# Debug issues${NC}"
    echo -e "  ./scripts/setup-ollama.sh logs\n"
    
    echo -e "${GREEN}CONFIGURATION:${NC}"
    echo -e "  Port:       ${YELLOW}$OLLAMA_PORT${NC} ${CYAN}(from .env LLM_SERVICE_URL)${NC}"
    echo -e "  Model:      ${YELLOW}$OLLAMA_MODEL${NC} ${CYAN}(from .env OLLAMA_MODEL)${NC}"
    echo -e "  Service:    ${YELLOW}$SERVICE_NAME${NC}"
    echo -e "  Mode:       ${YELLOW}$([ "$LLM_CONTAINERIZED" = "false" ] && echo "Homebrew" || echo "Docker")${NC} ${CYAN}(from .env LLM_CONTAINERIZED)${NC}"
    echo -e "  API URL:    ${YELLOW}http://localhost:$OLLAMA_PORT${NC}\n"
    
    echo -e "${GREEN}NOTES:${NC}"
    echo -e "  • Reads configuration from .env file"
    echo -e "  • Uses Homebrew-managed Ollama service (LLM_CONTAINERIZED=false)"
    echo -e "  • First run will download ~4GB $OLLAMA_MODEL model"
    echo -e "  • Models are persisted in ~/.ollama"
    echo -e "  • Service auto-starts on system boot"
    echo -e "  • Use 'install' command if Ollama not installed\n"
}

echo -e "${GREEN}🚀 Ollama Setup for Share My Recipe${NC}"

# Function to check if Homebrew is installed
check_homebrew() {
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}❌ Homebrew is not installed. Please install Homebrew first.${NC}"
        echo -e "${YELLOW}💡 Install with: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Homebrew is available${NC}"
}

# Function to check if Ollama is installed
check_ollama_installed() {
    if ! command -v ollama &> /dev/null; then
        echo -e "${RED}❌ Ollama is not installed.${NC}"
        echo -e "${YELLOW}💡 Install with: ./scripts/setup-ollama.sh install${NC}"
        return 1
    fi
    echo -e "${GREEN}✅ Ollama is installed${NC}"
    return 0
}

# Function to check if port is available
check_port_available() {
    if lsof -i :$OLLAMA_PORT > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port $OLLAMA_PORT is already in use${NC}"
        
        # Check what's using the port
        local port_info=$(lsof -i :$OLLAMA_PORT 2>/dev/null | tail -n +2)
        echo -e "${YELLOW}Processes using port $OLLAMA_PORT:${NC}"
        echo "$port_info"
        
        # Check if it's another Ollama container
        local other_containers=$(docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep ":$OLLAMA_PORT->" | grep -v "$CONTAINER_NAME" || true)
        if [ ! -z "$other_containers" ]; then
            echo -e "${YELLOW}📦 Other Ollama containers found:${NC}"
            echo "$other_containers"
            echo -e "${YELLOW}💡 You may want to stop them first:${NC}"
            docker ps --format 'table {{.Names}}' | grep ollama | grep -v "$CONTAINER_NAME" | while read container; do
                echo -e "  ${BLUE}docker stop $container${NC}"
            done
            return 1
        fi
        
        # Check if it's a local Ollama process
        if echo "$port_info" | grep -q "ollama.*$OLLAMA_PORT"; then
            echo -e "${YELLOW}💡 Local Ollama process detected. Stop it with:${NC}"
            echo -e "  ${BLUE}pkill ollama${NC}"
            return 1
        fi
        
        return 1
    fi
    return 0
}

# Function to check if Ollama service exists
service_exists() {
    brew services list | grep -q "^$SERVICE_NAME"
}

# Function to check if Ollama service is running
service_running() {
    brew services list | grep "^$SERVICE_NAME" | grep -q "started"
}

# Function to install Ollama via Homebrew
install_ollama() {
    echo -e "${GREEN}📦 Installing Ollama via Homebrew...${NC}"
    if brew install ollama; then
        echo -e "${GREEN}✅ Ollama installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install Ollama${NC}"
        exit 1
    fi
}

# Function to start Ollama service
start_ollama() {
    if service_running; then
        echo -e "${GREEN}✅ Ollama service is already running${NC}"
        return 0
    fi
    
    # Check if port is available before starting
    if ! check_port_available; then
        echo -e "${RED}❌ Cannot start service - port $OLLAMA_PORT is in use${NC}"
        echo -e "${YELLOW}💡 Use './scripts/setup-ollama.sh status' to see current state${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}� Starting Ollama service...${NC}"
    if brew services start $SERVICE_NAME; then
        echo -e "${GREEN}✅ Ollama service started on port $OLLAMA_PORT${NC}"
    else
        echo -e "${RED}❌ Failed to start Ollama service${NC}"
        exit 1
    fi
}

# Function to wait for Ollama to be ready
wait_for_ollama() {
    echo -e "${YELLOW}⏳ Waiting for Ollama to be ready...${NC}"
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$OLLAMA_PORT/api/tags" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Ollama is ready!${NC}"
            return 0
        fi
        echo -e "${YELLOW}Attempt $attempt/$max_attempts - waiting...${NC}"
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ Ollama failed to start within expected time${NC}"
    echo -e "${YELLOW}💡 Try: ./scripts/setup-ollama.sh logs${NC}"
    exit 1
}

# Function to check if model is installed
model_installed() {
    ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"
}

# Function to pull the model
pull_model() {
    if model_installed; then
        echo -e "${GREEN}✅ $OLLAMA_MODEL model is already installed${NC}"
        echo -e "${YELLOW}💡 Use './scripts/setup-ollama.sh pull' to update it${NC}"
        return 0
    fi
    
    echo -e "${GREEN}📥 Pulling $OLLAMA_MODEL model...${NC}"
    echo -e "${YELLOW}⏳ This may take several minutes (downloading ~4GB)...${NC}"
    
    if ollama pull "$OLLAMA_MODEL"; then
        echo -e "${GREEN}✅ $OLLAMA_MODEL model downloaded successfully${NC}"
    else
        echo -e "${RED}❌ Failed to download $OLLAMA_MODEL model${NC}"
        exit 1
    fi
}

# Function to test the setup
test_ollama() {
    echo -e "${GREEN}🧪 Testing Ollama setup...${NC}"
    
    if ! service_running; then
        echo -e "${RED}❌ Ollama service is not running${NC}"
        return 1
    fi
    
    local test_prompt="Hello, respond with just 'OK'"
    echo -e "${YELLOW}📤 Sending test prompt: \"$test_prompt\"${NC}"
    
    response=$(curl -s -X POST "http://localhost:$OLLAMA_PORT/api/generate" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"$OLLAMA_MODEL\",\"prompt\":\"$test_prompt\",\"stream\":false}" \
        --max-time 30)
    
    if echo "$response" | grep -qi "ok"; then
        echo -e "${GREEN}✅ Ollama is working correctly!${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Ollama started but test response was unexpected${NC}"
        echo -e "${YELLOW}Response preview:${NC} $(echo "$response" | head -c 100)..."
        return 1
    fi
}

# Function to show status
show_status() {
    echo -e "\n${CYAN}📊 Ollama Status Report${NC}"
    echo -e "${CYAN}=====================${NC}"
    
    echo -e "\n${GREEN}Configuration:${NC}"
    echo -e "  Service:    ${YELLOW}$SERVICE_NAME${NC}"
    echo -e "  Port:       ${YELLOW}$OLLAMA_PORT${NC}"
    echo -e "  Model:      ${YELLOW}$OLLAMA_MODEL${NC}"
    echo -e "  API URL:    ${YELLOW}http://localhost:$OLLAMA_PORT${NC}"
    
    echo -e "\n${GREEN}Service Status:${NC}"
    if service_running; then
        echo -e "  Status: ${GREEN}✅ Running${NC}"
        local service_info=$(brew services list | grep "^$SERVICE_NAME")
        echo -e "  Info:   ${YELLOW}$service_info${NC}"
    elif service_exists; then
        echo -e "  Status: ${YELLOW}⏸️  Stopped${NC}"
    else
        echo -e "  Status: ${RED}❌ Not installed${NC}"
        return 0
    fi
    
    echo -e "\n${GREEN}Models:${NC}"
    if service_running && command -v ollama &> /dev/null; then
        if model_installed; then
            ollama list | while read -r line; do
                echo -e "  ${YELLOW}$line${NC}"
            done
        else
            echo -e "  ${RED}❌ $OLLAMA_MODEL model not installed${NC}"
        fi
    else
        echo -e "  ${RED}❌ Service not running or ollama command not available${NC}"
    fi
    
    echo -e "\n${GREEN}Useful Commands:${NC}"
    echo -e "  • Test API:     ${YELLOW}./scripts/setup-ollama.sh test${NC}"
    echo -e "  • View logs:    ${YELLOW}./scripts/setup-ollama.sh logs${NC}"
    echo -e "  • Restart:      ${YELLOW}./scripts/setup-ollama.sh restart${NC}"
    echo -e "  • Update model: ${YELLOW}./scripts/setup-ollama.sh pull${NC}"
}

# Function to list models
list_models() {
    if ! service_running; then
        echo -e "${RED}❌ Ollama service is not running${NC}"
        return 1
    fi
    
    echo -e "${GREEN}📋 Installed Models:${NC}"
    ollama list
}

# Function to check port usage
check_port_usage() {
    echo -e "${CYAN}🔍 Port $OLLAMA_PORT Usage Analysis${NC}"
    echo -e "${CYAN}==============================${NC}\n"
    
    if lsof -i :$OLLAMA_PORT > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port $OLLAMA_PORT is currently in use:${NC}"
        lsof -i :$OLLAMA_PORT | while read line; do
            echo -e "  ${YELLOW}$line${NC}"
        done
        echo
        
        # Check if it's the Ollama service
        if lsof -i :$OLLAMA_PORT | grep -q "ollama"; then
            echo -e "${GREEN}✅ Port is being used by Ollama service${NC}"
            if service_running; then
                echo -e "${GREEN}✅ Ollama service is running normally${NC}"
            else
                echo -e "${YELLOW}⚠️  Ollama process found but service may not be managed by Homebrew${NC}"
                echo -e "${YELLOW}💡 Try: brew services restart $SERVICE_NAME${NC}"
            fi
        else
            echo -e "${YELLOW}💡 Port is being used by a different process${NC}"
            echo -e "${GREEN}Suggested actions:${NC}"
            echo -e "  ${BLUE}sudo lsof -ti:$OLLAMA_PORT | xargs kill${NC}  # Kill processes using the port"
            echo -e "  ${BLUE}./scripts/setup-ollama.sh start${NC}         # Then start Ollama"
        fi
        
    else
        echo -e "${GREEN}✅ Port $OLLAMA_PORT is available${NC}"
    fi
}


# Main setup function
main_setup() {
    echo -e "${GREEN}Starting full Ollama setup...${NC}\n"
    
    check_homebrew
    if ! check_ollama_installed; then
        install_ollama
    fi
    start_ollama
    wait_for_ollama
    pull_model
    test_ollama
    show_status
    
    echo -e "\n${GREEN}🎉 Ollama is ready for Share My Recipe!${NC}"
    echo -e "${YELLOW}💡 Start your app with: npm run dev${NC}"
    echo -e "${YELLOW}💡 Use './scripts/setup-ollama.sh help' for more commands${NC}"
}

# Handle script arguments
case "${1:-}" in
    "start")
        check_homebrew
        if ! check_ollama_installed; then
            install_ollama
        fi
        start_ollama
        wait_for_ollama
        echo -e "${GREEN}✅ Ollama started successfully${NC}"
        ;;
    "stop")
        echo -e "${YELLOW}🛑 Stopping Ollama service...${NC}"
        if brew services stop $SERVICE_NAME; then
            echo -e "${GREEN}✅ Ollama stopped${NC}"
        else
            echo -e "${RED}❌ Failed to stop Ollama${NC}"
        fi
        ;;
    "restart")
        echo -e "${YELLOW}🔄 Restarting Ollama service...${NC}"
        brew services restart $SERVICE_NAME
        wait_for_ollama
        echo -e "${GREEN}✅ Ollama restarted${NC}"
        ;;
    "status")
        show_status
        ;;
    "logs")
        if service_running; then
            echo -e "${GREEN}📋 Ollama logs (Ctrl+C to exit):${NC}"
            echo -e "${YELLOW}Note: Homebrew services logs are in /opt/homebrew/var/log/${NC}"
            tail -f /opt/homebrew/var/log/$SERVICE_NAME.log 2>/dev/null || \
                echo -e "${YELLOW}Log file not found. Try: brew services restart $SERVICE_NAME${NC}"
        else
            echo -e "${RED}❌ Service not running${NC}"
        fi
        ;;
    "pull")
        if service_running || check_ollama_installed; then
            echo -e "${GREEN}📥 Updating $OLLAMA_MODEL model...${NC}"
            ollama pull "$OLLAMA_MODEL"
            echo -e "${GREEN}✅ Model update complete${NC}"
        else
            echo -e "${RED}❌ Ollama is not installed or running${NC}"
        fi
        ;;
    "test")
        test_ollama
        ;;
    "models")
        list_models
        ;;
    "install")
        check_homebrew
        install_ollama
        echo -e "${GREEN}💡 Now run: ./scripts/setup-ollama.sh start${NC}"
        ;;
    "port")
        check_port_usage
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    "")
        main_setup
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo -e "${YELLOW}💡 Use './scripts/setup-ollama.sh help' to see available commands${NC}"
        exit 1
        ;;
esac
