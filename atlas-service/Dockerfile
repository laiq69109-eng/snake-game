FROM node:24-bookworm-slim
WORKDIR /srv/atlas
COPY . .
RUN npm install --prefix apps/server --omit=dev --no-audit --no-fund && mkdir -p var && chown node:node var
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "apps/server/index.mjs"]
