FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl openssl-dev
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY tsconfig.railway.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
# Install deps WITHOUT running prisma generate (we'll copy the generated client from builder)
RUN npm install --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
# Copy the ENTIRE node_modules/.prisma (generated client) from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "DATABASE_URL=$DIRECT_URL npx prisma migrate deploy --schema prisma/schema.prisma && node dist/index.js"]
