# Worker BullMQ (isolado). Deps concretas (sem workspace:*) → build standalone com npm.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
USER worker
CMD ["node", "dist/main.js"]
