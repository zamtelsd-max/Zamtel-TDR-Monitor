FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl openssl-dev

# Install all deps (including dev for build)
COPY package*.json ./
RUN npm ci

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY tsconfig.railway.json ./
COPY src ./src
RUN npm run build

# Prune dev deps for smaller image
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3000

# Clean start — no migrations at runtime.
# Migrations run via Railway's "Deploy Command": npx prisma migrate deploy
CMD ["node", "dist/index.js"]
