FROM oven/bun:1.4.4-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

USER bun

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "src/index.ts"]
