# Build stage
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL=https://derm-api-production.up.railway.app
ARG VITE_WS_URL=https://derm-api-production.up.railway.app
ARG VITE_USE_PRESIGN=true
ARG VITE_ENABLE_LOCAL_DEMO=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_USE_PRESIGN=$VITE_USE_PRESIGN
ENV VITE_ENABLE_LOCAL_DEMO=$VITE_ENABLE_LOCAL_DEMO

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app

RUN npm install -g serve@14.2.4

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
