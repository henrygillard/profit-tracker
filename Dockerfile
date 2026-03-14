FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
# Build frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
RUN npm run build
WORKDIR /app
EXPOSE 3000
CMD ["node", "server.js"]
