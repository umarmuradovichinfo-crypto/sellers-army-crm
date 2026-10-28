# Sellers Army CRM — bitta image: frontend (Vite) backend ichida uzatiladi. ffmpeg — audio 8 kHz wav; espeak-ng — mahalliy ovoz sintezi (TTS, kalitsiz).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg espeak-ng \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
# frontend + backend o'rnatiladi va yig'iladi, frontend/dist -> backend/dist/public
RUN npm run build
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
# migratsiya -> seed (idempotent) -> server
CMD ["npm", "start"]
