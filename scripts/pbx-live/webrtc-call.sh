#!/usr/bin/env bash
# Jonli sinov 11: brauzer telefoni (frontend/src/lib/webrtcPhone.js — JsSIP) haqiqiy headless Chromium'da, soxta mikrofon bilan
# (--use-fake-device-for-media-stream: doimiy signal) → Asterisk 23 WebRTC endpoint «<ext>-web» (DTLS-SRTP, ICE, rtcp-mux) → <to> (baresip, avto-javob).
# Chromium konteyneri Asterisk bilan bir Docker tarmog'ida (macOS'dan Colima VM'ga UDP o'tmaydi — shuning uchun brauzer ham konteynerda).
# Natija: brauzer getStats (DTLS/ICE holati, SRTP shifr, yuborilgan/olingan paketlar) + qabul qiluvchi yozgan audio (RMS).
# Ishlatish: webrtc-call.sh [ext=100] [to=101]       Talab: crm-chromium-test tasviri (scripts/pbx-live/chromium/Dockerfile — birinchi marta ~20 daqiqa).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
EXT="${1:-100}"; TO="${2:-101}"
OUT="$HOME/.crm-live/webrtc"; mkdir -p "$OUT"
docker image inspect crm-chromium-test >/dev/null 2>&1 || docker build -q -t crm-chromium-test "$HERE/chromium" >/dev/null
(cd "$ROOT/frontend" && npx esbuild src/lib/webrtcPhone.js --bundle --format=iife --global-name=CRMPhone --platform=browser --log-level=warning --outfile="$OUT/phone.js")
cp "$HERE/webrtc/index.html" "$OUT/index.html"
AST_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' crm-ast-live)"
PW="$(grep -A8 "^\[$EXT-web\]" ~/.crm-live/etc/pjsip_crm.conf | grep -m1 '^password=' | cut -d= -f2)"
[ -n "$PW" ] || { echo "$EXT-web paroli topilmadi"; exit 1; }
# qabul qiluvchi: baresip (avto-javob), olgan ovozini /tmp/rx_<to>.wav ga yozadi
pw() { grep -A8 "^\[$1\]" ~/.crm-live/etc/pjsip_crm.conf | grep -m1 '^password=' | cut -d= -f2; }
MOD="$(docker exec crm-ast-live sh -c 'dirname $(dpkg -L baresip-core | grep "/g711.so")')"
docker exec crm-ast-live pkill baresip 2>/dev/null || true
docker exec crm-ast-live sh -c "rm -f /tmp/rx_$TO.wav; mkdir -p /root/bs/$TO && cat > /root/bs/$TO/config <<CFG
sip_listen 127.0.0.1:5071
audio_player aufile,/tmp/rx_$TO.wav
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
echo '<sip:$TO@127.0.0.1>;auth_pass=$(pw "$TO");regint=60;answermode=auto;audio_codecs=pcmu' > /root/bs/$TO/accounts"
docker exec -d crm-ast-live sh -c "(sleep $(( ${WTIMEOUT:-35} + 10 ))) | baresip -f /root/bs/$TO > /tmp/bs_$TO.log 2>&1"
sleep 3
HASH="ws=ws://$AST_IP:8088/ws&uri=sip:$EXT-web@$AST_IP&pw=$PW&to=$TO&talk=6&timeout=${WTIMEOUT:-35}"
docker rm -f crm-chromium >/dev/null 2>&1 || true
set +e
docker run --rm --name crm-chromium -v "$OUT:/page:ro" crm-chromium-test timeout $(( ${WTIMEOUT:-35} + 5 )) chromium --headless=new --no-sandbox --disable-gpu \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required \
  --enable-logging=stderr --v=0 --allow-file-access-from-files "file:///page/index.html#$HASH" > "$OUT/chromium.log" 2>&1
set -e
echo "--- brauzer:"; grep -oE '"(PHONE|RESULT) [^"]*|RESULT \{.*' "$OUT/chromium.log" | sed 's/\\"/"/g' | tail -12
echo "--- qabul qiluvchi ($TO):"; docker exec crm-ast-live sh -c "cat /tmp/bs_$TO.log" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -iE "answering|established|terminated" | head -3
docker cp "crm-ast-live:/tmp/rx_$TO.wav" "$OUT/rx.wav" >/dev/null 2>&1 && python3 - "$OUT/rx.wav" <<'PY'
import sys, wave, struct, math
w = wave.open(sys.argv[1]); n = w.getnframes(); d = w.readframes(n)
s = struct.unpack('<%dh' % n, d) if n else []
rms = int(math.sqrt(sum(x * x for x in s) / n)) if n else 0
print(f'qabul qiluvchi olgan audio: {n / w.getframerate():.1f} s, RMS {rms} ({"ovoz bor" if rms > 200 else "JIMLIK"})')
PY
docker exec crm-ast-live pkill baresip 2>/dev/null || true
