FROM node:20-alpine
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
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "DATABASE_URL=$DIRECT_URL npx prisma migrate deploy --schema prisma/schema.prisma && node dist/index.js"]
