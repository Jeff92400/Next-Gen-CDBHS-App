#!/bin/bash
# Railway setup script - copies frontend files and installs dependencies

echo "Setting up application for Railway deployment..."

# Copy frontend files to backend directory
cp -r ../frontend ./frontend

echo "Frontend files copied successfully"
echo "Installing dependencies..."

npm install

echo "Setup complete!"
