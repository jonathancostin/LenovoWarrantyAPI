#!/bin/bash

# PM2 Deployment Script for Lenovo Warranty API
# This script helps deploy and manage the API with PM2

echo "🚀 Lenovo Warranty API Deployment Script"
echo "========================================="

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing PM2 globally..."
    npm install -g pm2
else
    echo "✅ PM2 is already installed"
fi

# Check if logs directory exists
if [ ! -d "./logs" ]; then
    echo "📁 Creating logs directory..."
    mkdir -p logs
fi

# Function to display menu
show_menu() {
    echo ""
    echo "Choose an action:"
    echo "1) Start API server"
    echo "2) Stop API server"
    echo "3) Restart API server"
    echo "4) View status"
    echo "5) View logs (real-time)"
    echo "6) Setup auto-start on boot"
    echo "7) Reload with zero-downtime"
    echo "8) Scale instances"
    echo "9) Monitor dashboard"
    echo "0) Exit"
    echo ""
}

# Read user choice
read_choice() {
    local choice
    read -p "Enter choice [0-9]: " choice
    case $choice in
        1) start_api ;;
        2) stop_api ;;
        3) restart_api ;;
        4) show_status ;;
        5) show_logs ;;
        6) setup_startup ;;
        7) reload_api ;;
        8) scale_instances ;;
        9) monitor_dashboard ;;
        0) exit 0 ;;
        *) echo "Invalid option. Please try again." && show_menu ;;
    esac
}

# Start API
start_api() {
    echo "🔄 Starting Lenovo Warranty API..."
    pm2 start ecosystem.config.js
    pm2 save
    echo "✅ API started successfully"
    show_status
}

# Stop API
stop_api() {
    echo "🛑 Stopping Lenovo Warranty API..."
    pm2 stop lenovo-warranty-api
    echo "✅ API stopped"
}

# Restart API
restart_api() {
    echo "🔄 Restarting Lenovo Warranty API..."
    pm2 restart lenovo-warranty-api
    echo "✅ API restarted"
    show_status
}

# Show status
show_status() {
    echo ""
    echo "📊 Current Status:"
    pm2 status lenovo-warranty-api
}

# Show logs
show_logs() {
    echo "📜 Showing real-time logs (Ctrl+C to exit)..."
    pm2 logs lenovo-warranty-api
}

# Setup startup script
setup_startup() {
    echo "⚙️  Setting up auto-start on system boot..."
    pm2 startup
    pm2 save
    echo "✅ Auto-start configured. The API will start automatically on system boot."
}

# Reload with zero downtime
reload_api() {
    echo "♻️  Performing zero-downtime reload..."
    pm2 reload lenovo-warranty-api
    echo "✅ API reloaded without downtime"
}

# Scale instances
scale_instances() {
    echo "Current instances running:"
    pm2 status lenovo-warranty-api
    read -p "Enter number of instances (1-8): " instances
    pm2 scale lenovo-warranty-api $instances
    echo "✅ Scaled to $instances instances"
    show_status
}

# Monitor dashboard
monitor_dashboard() {
    echo "📊 Opening PM2 monitoring dashboard (Ctrl+C to exit)..."
    pm2 monit
}

# Main loop
while true
do
    show_menu
    read_choice
done