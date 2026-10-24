# Meta Connector — nol bog'liqlik (faqat Node 24 ichki modullari + node:sqlite)
FROM node:24-slim
WORKDIR /app
COPY package.json server.js ./
ENV NODE_ENV=production PORT=8100 DATABASE_PATH=/data/connector.db
VOLUME ["/data"]
EXPOSE 8100
CMD ["node", "server.js"]
