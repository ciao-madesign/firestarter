FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 LAB_HOST=0.0.0.0 LAB_DATA_DIR=/data LAB_COURSE_FILE=/data/course/progress.json LAB_WEB_ROOT=/app/dist/web
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "dist/server.mjs"]
