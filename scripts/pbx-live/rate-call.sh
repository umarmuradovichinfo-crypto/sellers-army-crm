#!/usr/bin/env bash
# Jonli sinov 11: sifat bahosi (IVR). Soxta provayder (prov.sh) kerak; trunk.mjs bilan trunk + guruh 10.
#   rate-call.sh in   — provayderdan kiruvchi → guruh 10 → 101 javob beradi va 5 s dan keyin qo'yadi → mijoz IVR'da 4 ni bosadi
#   rate-call.sh out  — 100 → 998907770005 (provayder javob beradi) → 100 6 s dan keyin qo'yadi → mijoz 5 ni bosadi (scope=all)
set -euo pipefail
MODE="${1:-in}"
pw() { grep -A8 "^\[$1\]" ~/.crm-live/etc/pjsip_crm.conf | grep -m1 '^password=' | cut -d= -f2; }
MOD="$(docker exec crm-ast-live sh -c 'dirname $(dpkg -L baresip-core | grep "/g711.so")')"
mk() { docker exec crm-ast-live sh -c "mkdir -p /root/bs/$1 && cat > /root/bs/$1/config <<CFG
sip_listen 127.0.0.1:$2
audio_player aufile,/tmp/rx_$1.wav
audio_source aufile,/var/spool/asterisk/monitor/tone.wav
audio_alert aufile,/dev/null
ausrc_srate 8000
ausrc_channels 1
auplay_srate 8000
auplay_channels 1
module_path $MOD
module stdio.so
module g711.so
module account.so
module menu.so
module aufile.so
CFG
echo '<sip:$1@127.0.0.1>;auth_pass=$3;regint=60;answermode=$4;audio_codecs=pcmu' > /root/bs/$1/accounts"; }
clean() { sed 's/\x1b\[[0-9;]*[A-Za-z]//g'; }
docker exec crm-ast-live pkill baresip 2>/dev/null || true
docker exec crm-ast-live asterisk -rx "core set verbose 3" >/dev/null
if [ "$MODE" = in ]; then
  mk 101 5071 "$(pw 101)" auto
  docker exec -d crm-ast-live sh -c "(sleep 10; echo /hangup; sleep 25) | baresip -f /root/bs/101 > /tmp/bs_101.log 2>&1"
  sleep 4
  docker exec crm-ast-prov asterisk -rx "channel originate PJSIP/0552233 extension rate@provider-out" || true
  sleep 24
  echo "--- 101:"; docker exec crm-ast-live sh -c "cat /tmp/bs_101.log" | clean | grep -iE "incoming|answering|established|terminated" | head -4
else
  mk 100 5072 "$(pw 100)" manual
  docker exec crm-ast-live sh -c "(sleep 3; echo /dial sip:998907770005@127.0.0.1; sleep 8; echo /hangup; sleep 16; echo /quit) | baresip -f /root/bs/100 > /tmp/bs_100.log 2>&1" || true
  echo "--- 100:"; docker exec crm-ast-live sh -c "cat /tmp/bs_100.log" | clean | grep -iE "established|terminated|failed" | head -4
fi
echo "--- Asterisk (crm-rate):"
docker logs --since 45s crm-ast-live 2>&1 | grep -aE "crm-rate|Read\(|UserEvent\(CrmRate|User entered" | tail -8 || true
docker exec crm-ast-live pkill baresip 2>/dev/null || true
