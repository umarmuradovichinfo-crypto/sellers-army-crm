#!/usr/bin/env bash
# Soxta SIP-provayder (ikkinchi Asterisk): bizning stansiya unga trunk sifatida ro'yxatdan o'tadi; kiruvchi/chiquvchi tashqi qo'ng'iroqni sinash uchun.
# Ishlatish: scripts/pbx-live/prov.sh   → provayder IP si chiqadi
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P="$HOME/.crm-prov"
rm -rf "$P"; mkdir -p "$P"
ASTERISK_SOUNDS_LANG=none AMI_SECRET=provsecret AMI_PERMIT="0.0.0.0/0.0.0.0" "$ROOT/deploy/asterisk/init.sh" "$P" >/dev/null
cat > "$P/etc/pjsip.conf" <<'CFG'
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

[0552233]
type=endpoint
context=provider-in
disallow=all
allow=ulaw
auth=0552233
aors=0552233
direct_media=no
rtp_symmetric=yes
force_rport=yes

[0552233]
type=auth
auth_type=userpass
username=0552233
password=trunkpass

[0552233]
type=aor
max_contacts=1
remove_existing=yes
CFG
cat > "$P/etc/extensions.conf" <<'CFG'
[general]
[provider-in]
; bizning stansiyadan trunk orqali kelgan chiquvchi qo'ng'iroq: javob berib 6 soniya turadi
exten => _X.,1,NoOp(Provayderga chiquvchi: ${EXTEN} from ${CALLERID(num)})
 same => n,Answer()
 same => n,Wait(6)
 same => n,Hangup()
[provider-out]
; provayderdan bizga kiruvchi (originate shu kontekstda)
exten => s,1,Answer()
 same => n,Wait(6)
 same => n,Hangup()
CFG
chmod -R a+rwX "$P"
docker rm -f crm-ast-prov >/dev/null 2>&1 || true
docker run -d --name crm-ast-prov -v "$P/etc:/etc/asterisk" crm-ast-test >/dev/null
for i in $(seq 1 30); do docker exec crm-ast-prov asterisk -rx "core show version" >/dev/null 2>&1 && break; sleep 1; done
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' crm-ast-prov
