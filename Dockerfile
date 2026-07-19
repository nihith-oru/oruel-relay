FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/prisma ./prisma

# Cloud Run injects $PORT; config.ts already reads it via process.env.PORT.
EXPOSE 4000
CMD ["node", "dist/server.js"]
