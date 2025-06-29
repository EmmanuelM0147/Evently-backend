#!/bin/bash

# Docker startup script for Evently API

echo "🚀 Starting Evently API with Docker..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please update the .env file with your actual configuration values."
fi

# Choose the compose file based on environment
COMPOSE_FILE="docker-compose.yml"
if [ "$1" = "dev" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    echo "🛠️  Starting in development mode..."
else
    echo "🏭 Starting in production mode..."
fi

# Build and start the containers
echo "🔨 Building Docker images..."
docker-compose -f $COMPOSE_FILE build

echo "▶️  Starting containers..."
docker-compose -f $COMPOSE_FILE up -d

echo "✅ Evently API is starting up!"
echo "📊 API will be available at: http://localhost:3000"
echo "💾 PostgreSQL will be available at: localhost:5432"
echo ""
echo "📋 Useful commands:"
echo "  View logs: docker-compose -f $COMPOSE_FILE logs -f"
echo "  Stop: docker-compose -f $COMPOSE_FILE down"
echo "  Restart: docker-compose -f $COMPOSE_FILE restart"
echo "  Shell access: docker-compose -f $COMPOSE_FILE exec evently-api sh"