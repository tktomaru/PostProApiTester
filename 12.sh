#!/bin/bash

# PostPro API Tester - Test Script
# This script runs comprehensive tests for the Chrome extension

set -e

echo "🧪 Testing PostPro API Tester..."

# Check if dist directory exists (built extension)
if [ ! -d "dist" ]; then
    echo "⚠️  Extension not built. Running build first..."
    ./11.sh
fi

# Install test dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if test dependencies are installed
echo "🔍 Checking test dependencies..."
if ! npm list jest >/dev/null 2>&1; then
    echo "📦 Installing test dependencies..."
    npm install
fi

# Run TypeScript compilation check
echo "🔧 Running TypeScript check..."
npx tsc --noEmit

# Run Jest tests with Puppeteer
echo "🚀 Running extension tests..."
npm test

# Check if tests passed
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
    echo "🎉 PostPro API Tester is working correctly!"
    echo ""
    echo "📋 Test Summary:"
    echo "   - Extension loading and initialization"
    echo "   - Popup UI functionality"
    echo "   - Request sending and response handling"
    echo "   - Variable replacement system"
    echo "   - Test execution framework"
    echo "   - Background script operation"
    echo "   - Content script injection"
else
    echo ""
    echo "❌ Some tests failed!"
    echo "🔍 Check the test output above for details"
    exit 1
fi