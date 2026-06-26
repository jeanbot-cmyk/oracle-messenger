#!/bin/bash

git pull origin main
docker-compose down
docker-compose build
docker-compose up -d