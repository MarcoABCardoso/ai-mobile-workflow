FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ dist/
EXPOSE {{service_port}}
CMD ["node", "dist/index.js"]
