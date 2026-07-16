FROM node:22-alpine

WORKDIR /app

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

CMD [sh, ./docker-entrypoint.sh]
