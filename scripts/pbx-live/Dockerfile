# Sinov uchun Asterisk + baresip (haqiqiy softfon) + espeak-ng (mahalliy ovoz sintezi, TTS sinovi) — faqat scripts/pbx-live ishlatadi, ishlab chiqarish tasviri emas.
FROM andrius/asterisk:latest
USER root
RUN apt-get update -qq && apt-get install -y -qq baresip espeak-ng && rm -rf /var/lib/apt/lists/*
