#!/usr/bin/env bash
# Yangi serverni birinchi sozlash (root sifatida, Ubuntu/Debian): Docker, xavfsizlik devori, fail2ban, avto-yangilanish.
# SSH parol bilan kirishni O'CHIRMAYDI (o'zingiz SSH kalit bilan kirishni tekshirgach qo'lda o'chiring: /etc/ssh/sshd_config → PasswordAuthentication no).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "root sifatida ishga tushiring"; exit 1; }
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades curl git age rclone ca-certificates
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades
echo "Tayyor. Keyingi: repo'ni /opt/crm ga klonlang, deploy/.env ni to'ldiring, 'docker build -t crm:latest .' va 'cd deploy && docker compose up -d'."
