#!/bin/bash

# PostPro API Tester - Build Script
# This script builds the Chrome extension for production

set -e

echo "🔨 Building PostPro API Tester..."

# Clean previous build
if [ -d "dist" ]; then
    echo "🧹 Cleaning previous build..."
    rm -rf dist
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run TypeScript compilation and Vite build
echo "🚀 Running build..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo "📁 Extension files are in the 'dist' directory"
    echo ""
    echo "🚀 To load the extension in Chrome:"
    echo "   1. Open Chrome and go to chrome://extensions/"
    echo "   2. Enable 'Developer mode'"
    echo "   3. Click 'Load unpacked' and select the 'dist' folder"
else
    echo "❌ Build failed!"
    exit 1
fi