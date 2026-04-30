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
# Patch compiled JS: Prisma generates camelCase model names, code uses snake_case
RUN find dist -name "*.js" | xargs sed -i \
    -e 's/\.agent\b/.agents/g' \
    -e 's/\.visit\b/.visits/g' \
    -e 's/\.floatIssue\b/.float_issues/g' \
    -e 's/\.salesTarget\b/.sales_targets/g' \
    -e 's/\.prospect\b/.prospects/g' \
    -e 's/\.user\b/.users/g'

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "DATABASE_URL=$DIRECT_URL npx prisma migrate deploy --schema prisma/schema.prisma && node dist/index.js"]
