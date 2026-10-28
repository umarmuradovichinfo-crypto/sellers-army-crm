#!/usr/bin/env bash
# Jonli sinov 9: tugma bosish (DTMF, RFC 4733) bilan qo'ng'iroq — IVR menyu, ovozli pochta, vaqt qoidasi.
# Ishlatish: dtmf-call.sh <qo'ng'iroq qiluvchi ext> <terilgan raqam> "<ketma-ketlik>" [avto-javob beruvchi extlar...]
#   ketma-ketlik: bo'shliq bilan ajratilgan: `wN` — N soniya kutish, boshqa har belgi (0-9 * #) — tugma.  Masalan: "w3 1 w8"
# Natija: baresip jurnali (qo'ng'iroq qiluvchi va javob beruvchilar) + Asterisk dialplan izi (verbose).
set -euo pipefail
FROM="$1"; DIAL="$2"; SEQ="$3"; shift 3; RECV=("$@")
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
docker exec crm-ast-live pkill baresip 2>/dev/null || true
n=0
for r in "${RECV[@]:-}"; do [ -n "$r" ] || continue; n=$((n+1)); mk "$r" $((5070+n)) "$(pw "$r")" auto; docker exec -d crm-ast-live sh -c "(sleep 60) | baresip -f /root/bs/$r > /tmp/bs_$r.log 2>&1"; done
mk "$FROM" 5090 "$(pw "$FROM")" manual
sleep 3
# ketma-ketlik → shell buyruqlari (tugma — alohida belgi, Enter'siz: stdio uni darrov DTMF qilib yuboradi)
script="sleep 3; echo /dial sip:$DIAL@127.0.0.1;"
for tok in $SEQ; do
  case "$tok" in w*) script+=" sleep ${tok#w};" ;; *) script+=" printf '%s' '$tok'; sleep 0.4;" ;; esac
done
script+=" echo /hangup; sleep 2; echo /quit"
docker exec crm-ast-live asterisk -rx "core set verbose 3" >/dev/null
docker exec crm-ast-live sh -c "($script) | baresip -f /root/bs/$FROM > /tmp/bs_$FROM.log 2>&1" || true
sleep 1
clean() { sed 's/\x1b\[[0-9;]*[A-Za-z]//g'; }
echo "--- $FROM:"; docker exec crm-ast-live sh -c "cat /tmp/bs_$FROM.log" | clean | grep -iE "established|terminated|failed|rejected|dtmf|404|486|503" | head -8
for r in "${RECV[@]:-}"; do [ -n "$r" ] || continue; echo "--- $r:"; docker exec crm-ast-live sh -c "cat /tmp/bs_$r.log" | clean | grep -iE "answering|established|terminated" | head -3; done
docker exec crm-ast-live pkill baresip 2>/dev/null || true
