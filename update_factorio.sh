#!/bin/bash

# Stop the Factorio server
echo "Stopping Factorio server..."
sudo systemctl stop factorio

# Navigate to your Factorio directory
cd /opt/Control/factorio || { echo "Failed to change directory to /opt/Control/factorio"; exit 1; }

# Download the latest version of Factorio
echo "Downloading latest Factorio server version..."
sudo wget https://factorio.com/get-download/stable/headless/linux64 -O factorio_headless_latest.tar.xz

# Extract and update the Factorio server files
echo "Extracting new files and updating Factorio..."
sudo tar -xf factorio_headless_latest.tar.xz --strip-components=1

# Start the Factorio server
echo "Starting Factorio server..."
sudo systemctl start factorio

echo "Factorio server update complete."
