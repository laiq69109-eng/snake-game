FROM node:24-alpine
WORKDIR /app
COPY package.json app.mjs game-worker.js ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY realtime.mjs ./
COPY src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788 DATA_DIR=/app/data TRUST_PROXY=1
EXPOSE 8788
CMD ["node","app.mjs"]
