# Brauzer telefoni sinovi uchun headless Chromium (Asterisk bilan bir Docker tarmog'ida — WebRTC media UDP to'g'ridan-to'g'ri).
# Faqat scripts/pbx-live/webrtc-call.mjs ishlatadi. Asos — crm-ast-test (Debian, kutubxonalar allaqachon bor).
FROM crm-ast-test
USER root
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
