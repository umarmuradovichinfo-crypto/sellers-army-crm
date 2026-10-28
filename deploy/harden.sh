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
# Asterisk (o'z stansiyamiz) SIP parol tanlashdan himoya: filtr + jail (qayta ishga tushirsa ham xavfsiz — fayllar ustiga yoziladi).
# Asterisk jurnali: deploy/asterisk/etc/logger.conf (security.log) → compose: asterisk-data/log. Fayl hali bo'lmasa bo'sh yaratiladi
# (aks holda fail2ban jail'ni ishga tushirmaydi).
HERE="$(cd "$(dirname "$0")" && pwd)"
F2B_LOG="${F2B_ASTERISK_LOG:-$HERE/asterisk-data/log/security.log}"
mkdir -p "$(dirname "$F2B_LOG")" && touch "$F2B_LOG"
chown 1000:1000 "$(dirname "$F2B_LOG")" "$F2B_LOG" 2>/dev/null || true # Asterisk konteyneri uid 1000 bilan yozadi
install -m 644 "$HERE/fail2ban/filter.d/asterisk-crm.conf" /etc/fail2ban/filter.d/asterisk-crm.conf
sed "s#__LOGPATH__#${F2B_LOG}#" "$HERE/fail2ban/jail.d/asterisk-crm.local" > /etc/fail2ban/jail.d/asterisk-crm.local
chmod 644 /etc/fail2ban/jail.d/asterisk-crm.local
# Asterisk jurnallari o'zi aylantirilmaydi — logrotate (copytruncate: Asterisk faylni qayta ochishi shart emas)
printf '%s {\n\tweekly\n\trotate 8\n\tcompress\n\tmissingok\n\tnotifempty\n\tcopytruncate\n}\n' "$(dirname "$F2B_LOG")/*.log" > /etc/logrotate.d/asterisk-crm
# DOCKER-USER zanjiri Docker o'rnatilgach paydo bo'ladi; fail2ban qayta yuklanadi (jail ro'yxati: fail2ban-client status asterisk-crm)
fail2ban-client reload >/dev/null 2>&1 || systemctl restart fail2ban
fail2ban-client status asterisk-crm >/dev/null 2>&1 && echo "fail2ban: asterisk-crm jail faol ($F2B_LOG)" || echo "(!) fail2ban asterisk-crm jail ishga tushmadi — journalctl -u fail2ban"
dpkg-reconfigure -f noninteractive unattended-upgrades
echo "Tayyor. Keyingi: repo'ni /opt/crm ga klonlang, deploy/.env ni to'ldiring, 'docker build -t crm:latest .' va 'cd deploy && docker compose up -d'."
