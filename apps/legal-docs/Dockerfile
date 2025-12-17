FROM node:20-alpine

WORKDIR /app

# Copiar SOLO los archivos de apps/legal-docs (no el monorepo completo)
COPY apps/legal-docs/package*.json ./
RUN npm install --legacy-peer-deps

COPY apps/legal-docs/ .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
