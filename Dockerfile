FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Overridden per-service by docker-compose.yml
CMD ["node", "frontend/server.mjs"]
