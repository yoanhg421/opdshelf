FROM oven/bun:1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build:css

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BOOKS_DIR=./books

# Copy built files
COPY --from=builder /app/src ./src
COPY --from=builder /app/views ./views
COPY --from=builder /app/static ./static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create directories
RUN mkdir -p /app/books /app/covers

# Expose the port
EXPOSE 3000

# Create volumes for persistent storage
VOLUME ["/app/books", "/app/covers", "/app/data"]

# Run the application
CMD ["bun", "run", "src/index.ts"]
