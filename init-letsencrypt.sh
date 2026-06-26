#!/bin/bash

if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

domains=(example.com www.example.com)
email="your-email@example.com" # Adding a valid address is strongly recommended
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

rsa_key_size=4096
data_path="./data/certbot"

if [ -d "$data_path" ]; then
  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

mkdir -p "$data_path/www"

# Download recommended TLS parameters
if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
fi

# Create dummy certificate
path="/etc/letsencrypt/live/$domains"
mkdir -p "$data_path/conf/live/$domains"

# Start nginx
docker-compose up --force-recreate -d nginx

# Delete dummy certificate
rm -Rf "$data_path/conf/live/$domains"

# Request Let's Encrypt certificate
if [ $staging != "0" ]; then
  staging_arg="--staging"
fi

certbot certonly --webroot -w "$data_path/www" $staging_arg \
  --email $email \
  --domains $domains \
  --rsa-key-size $rsa_key_size \
  --agree-tos \
  --force-renewal

# Reload nginx
sudo docker-compose exec nginx nginx -s reload