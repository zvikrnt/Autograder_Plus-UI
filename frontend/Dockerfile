# Frontend Dockerfile for React application (production: static build via Nginx)
# NOTE: built with the REPO ROOT as build context (see docker-compose.prod.yml's
# `frontend` service: `context: ., dockerfile: frontend/Dockerfile`), so every
# COPY below is relative to the repo root, not this file's own directory.
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
