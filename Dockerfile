FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY components.json next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs eslint.config.mjs next-env.d.ts ./
COPY aijinapi-landing.html aijinapi-login.html aijinapi-models.html ./
COPY aijinapi-landing-ja.html aijinapi-login-ja.html aijinapi-models-ja.html ./
RUN pnpm build

FROM rust:1.95-bookworm AS backend-builder
WORKDIR /app/backend

COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src
COPY backend/migrations ./migrations
RUN cargo build --release --bin aijinapi-backend --bin migrate --bin set_plan --bin create_key

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV SERVER_HOST=127.0.0.1
ENV SERVER_PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static
COPY --from=frontend-builder /app/public ./public
COPY --from=backend-builder /app/backend/target/release/aijinapi-backend ./backend/aijinapi-backend
COPY --from=backend-builder /app/backend/target/release/migrate ./backend/migrate
COPY --from=backend-builder /app/backend/target/release/set_plan ./backend/set_plan
COPY --from=backend-builder /app/backend/target/release/create_key ./backend/create_key
COPY --from=backend-builder /app/backend/migrations ./backend/migrations
COPY docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
