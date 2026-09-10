FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
COPY admin ./admin
# The db/ folder is created automatically on first run. Mount a volume at
# /app/db in production so client data survives restarts/redeploys.
VOLUME ["/app/db"]
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
