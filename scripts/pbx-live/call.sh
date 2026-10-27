#!/usr/bin/env bash
# Jonli sinov 2: haqiqiy softphone (baresip, Asterisk konteyneri ichida) — 101 ro'yxatdan o'tib avto-javob beradi,
# 100 ro'yxatdan o'tib unga qo'ng'iroq qiladi, 5 soniya gaplashadi (ausine tonlari), BYE.
# Ishlatish: scripts/pbx-live/call.sh [qo'ng'iroq qiluvchi ext] [qabul qiluvchi ext/raqam]   (standart 100 → 101)
set -euo pipefail
FROM="${1:-100}"; TO="${2:-101}"
pw() { grep -A8 "^\[$1\]" ~/.crm-live/etc/pjsip_crm.conf | grep -m1 '^password=' | cut -d= -f2; }
MOD="$(docker exec crm-ast-live sh -c 'dirname $(dpkg -L baresip-core | grep "/g711.so")')"
mk() { # ext port auto
  docker exec crm-ast-live sh -c "mkdir -p /root/bs/$1 && cat > /root/bs/$1/config <<CFG
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
echo '<sip:$1@127.0.0.1>;auth_pass=$3;regint=60;answermode=$4;audio_codecs=pcmu' > /root/bs/$1/accounts"
}
python3 - <<'PY'
import wave,math,struct,os
p=os.path.expanduser('~/.crm-live/rec/tone.wav')
w=wave.open(p,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
w.writeframes(b''.join(struct.pack('<h',int(8000*math.sin(2*math.pi*440*i/8000))) for i in range(8000*30))); w.close()
PY
chmod a+r ~/.crm-live/rec/tone.wav
docker exec crm-ast-live pkill baresip 2>/dev/null || true
mk "$TO" 5071 "$(pw "$TO")" auto
mk "$FROM" 5072 "$(pw "$FROM")" manual
docker exec -d crm-ast-live sh -c "(sleep 40) | baresip -f /root/bs/$TO > /tmp/bs_$TO.log 2>&1"
sleep 3
docker exec crm-ast-live asterisk -rx "pjsip show contacts" | grep "Contact:  $TO" || echo "(!) $TO ro'yxatdan o'tmadi"
docker exec crm-ast-live sh -c "(sleep 3; echo /dial sip:$TO@127.0.0.1; sleep 6; echo /hangup; sleep 2; echo /quit) | baresip -f /root/bs/$FROM > /tmp/bs_$FROM.log 2>&1" || true
sleep 1
echo "--- qo'ng'iroq qiluvchi ($FROM):"; docker exec crm-ast-live sh -c "sed 's/\x1b\[[0-9;]*[A-Za-z]//g' /tmp/bs_$FROM.log | grep -iE 'call|established|terminated|auth|registered|failed|error' | tail -12"
echo "--- qabul qiluvchi ($TO):"; docker exec crm-ast-live sh -c "sed 's/\x1b\[[0-9;]*[A-Za-z]//g' /tmp/bs_$TO.log | grep -iE 'call|established|terminated|registered|failed|error|incoming' | tail -10"
docker exec crm-ast-live pkill baresip 2>/dev/null || true
