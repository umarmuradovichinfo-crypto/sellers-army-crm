#!/usr/bin/env bash
# Jonli sinov 5: tashqi qo'ng'iroqlar (soxta provayder bilan). 
#   trunk-call.sh in    — provayderdan kiruvchi (DID 0552233 → guruh 10 → 101 avto-javob beradi)
#   trunk-call.sh out [raqam]  — 100 dan tashqi raqamga (qoida → trunk → provayder javob beradi)
set -euo pipefail
MODE="${1:-in}"; NUM="${2:-998901234567}"
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
module ausine.so
module aufile.so
CFG
echo '<sip:$1@127.0.0.1>;auth_pass=$3;regint=60;answermode=$4;audio_codecs=pcmu' > /root/bs/$1/accounts"; }
docker exec crm-ast-live pkill baresip 2>/dev/null || true
clean() { sed 's/\x1b\[[0-9;]*[A-Za-z]//g'; }
if [ "$MODE" = in ]; then
  mk 101 5071 "$(pw 101)" auto; mk 100 5072 "$(pw 100)" auto
  docker exec -d crm-ast-live sh -c "(sleep 30) | baresip -f /root/bs/101 > /tmp/bs_101.log 2>&1"
  docker exec -d crm-ast-live sh -c "(sleep 30) | baresip -f /root/bs/100 > /tmp/bs_100.log 2>&1"
  sleep 4
  docker exec crm-ast-prov asterisk -rx "channel originate PJSIP/0552233 extension s@provider-out" || true
  sleep 9
  for e in 101 100; do echo "--- $e:"; docker exec crm-ast-live sh -c "cat /tmp/bs_$e.log" | clean | grep -iE "incoming|answering|established|terminated|failed" | head -4; done
else
  mk 100 5072 "$(pw 100)" manual
  docker exec -d crm-ast-live sh -c "(sleep 30) | baresip -f /root/bs/100 > /tmp/bs_100.log 2>&1" ; sleep 3; docker exec crm-ast-live pkill baresip || true; sleep 1
  docker exec crm-ast-live sh -c "(sleep 3; echo /dial sip:$NUM@127.0.0.1; sleep 7; echo /hangup; sleep 2; echo /quit) | baresip -f /root/bs/100 > /tmp/bs_100.log 2>&1" || true
  echo "--- 100:"; docker exec crm-ast-live sh -c "cat /tmp/bs_100.log" | clean | grep -iE "call|established|terminated|failed|Progress" | head -8
fi
docker exec crm-ast-live pkill baresip 2>/dev/null || true
