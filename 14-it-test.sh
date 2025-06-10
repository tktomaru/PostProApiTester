#!/bin/bash

# PostPro API Tester - Integration Test Script
# This script runs integration tests for Chrome extension functionality

set -e

echo "🔧 Running PostPro API Tester Integration Tests..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the extension first
echo "🏗️ Building extension..."
npm run build

# Check if build succeeded
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not found"
    exit 1
fi

# Run TypeScript compilation check first
echo "🔧 Running TypeScript check..."
npx tsc --noEmit

# Run Jest integration tests only
echo "🚀 Running integration tests..."
npx jest tests/it/ --verbose --testTimeout=60000

# Check if tests passed
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All integration tests passed!"
    echo "🎉 PostPro API Tester Chrome extension is working correctly!"
    echo ""
    echo "📋 Integration Test Coverage:"
    echo "   - Extension build verification"
    echo "   - Chrome extension loading"
    echo "   - UI component rendering"
    echo "   - Request/response handling"
    echo "   - Background script functionality"
    echo ""
    echo "💡 To run unit tests: ./13-unit-test.sh"
else
    echo ""
    echo "❌ Some integration tests failed!"
    echo "🔍 Check the test output above for details"
    echo "💡 Make sure Chrome/Chromium is installed for Puppeteer tests"
    exit 1
fi