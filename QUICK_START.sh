#!/bin/bash

# Beton Inspector - Quick Start Script
# Epic 1-3: Authentication Foundation
#
# This script sets up and runs the local development environment

set -e

echo "🚀 Beton Inspector - Quick Start"
echo "=================================="
echo ""

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "✅ Python version: $python_version"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
pip install -r requirements.txt -q
echo "✅ Backend dependencies installed"

# Check for .env file
if [ ! -f ../.env ]; then
    echo ""
    echo "⚠️  No .env file found!"
    echo "📝 Creating .env file with template..."
    cat > ../.env << 'EOF'
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/beton

# Supabase (for real OAuth testing)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=

# Frontend
FRONTEND_URL=http://localhost:8501
API_URL=http://localhost:8000

# Environment
ENVIRONMENT=development
EOF
    echo "✅ .env template created"
    echo "📝 Please edit .env and add your Supabase credentials"
else
    echo "✅ .env file found"
fi

# Run migrations
echo ""
echo "🗄️  Applying database migrations..."
cd ..
alembic upgrade head 2>&1 | tail -5 || echo "⚠️  Migration skipped (database might not be running)"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
pip install -r requirements.txt -q
echo "✅ Frontend dependencies installed"

cd ..

echo ""
echo "=================================="
echo "✅ Setup complete!"
echo ""
echo "🚀 To start development:"
echo ""
echo "   Terminal 1 - Backend API:"
echo "   cd backend && python3 -m uvicorn app.main:app --reload"
echo ""
echo "   Terminal 2 - Frontend:"
echo "   cd frontend && streamlit run Home.py"
echo ""
echo "🌐 Then open: http://localhost:8501"
echo ""
echo "📝 Quick testing:"
echo "   1. Click 'Development: Mock OAuth'"
echo "   2. Click 'Simulate Google OAuth'"
echo "   3. You should see login success and authenticated interface"
echo ""
echo "📚 Full testing guide: see TESTING_GUIDE.md"
echo ""
