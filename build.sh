#!/usr/bin/env bash
set -e

echo "==> Installing frontend dependencies..."
cd Frontend
npm install

echo "==> Building frontend..."
npm run build

echo "==> Installing backend dependencies..."
cd ../Backend
pip install -r requirements.txt

echo "==> Build complete."
