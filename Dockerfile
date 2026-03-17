FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY web/package*.json ./web/
RUN cd web && npm install
COPY . .
RUN cd web && npm run build
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "server.js"]
