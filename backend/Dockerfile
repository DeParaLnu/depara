# Образ бекенда ДеПара. Збірка з контексту backend/:
#   docker build -t depara-backend backend
# Запуск (див. docs/deploy.md про змінні середовища):
#   docker run --env-file .env -p 3000:3000 depara-backend
FROM node:22-bookworm-slim

# Prisma потрібен openssl, а HTTPS-запитам до Google/Microsoft потрібні сертифікати
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Спершу залежності: цей шар кешується, поки не змінились package*.json і prisma/
# dev-залежності потрібні й у проді: бекенд запускається через tsx, а міграції через prisma CLI
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Міграції на старті, потім сервер. exec віддає сигнали SIGTERM серверу, а не оболонці
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node_modules/.bin/tsx src/server.ts"]
