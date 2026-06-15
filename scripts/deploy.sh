#!/bin/bash
set -e
echo "🚀 Deploying single backend..."
docker compose up -d --build backend frontend
docker compose exec -T backend python manage.py migrate --noinput
echo "🎉 Deploy complete."
