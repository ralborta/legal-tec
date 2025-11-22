# --- STAGE 1: build ---
FROM node:22-alpine AS builder

# Crear directorio de trabajo
WORKDIR /app

# Copiamos solo los archivos de dependencias primero (mejora cache)
COPY package*.json ./

# Instalamos dependencias
RUN npm ci --legacy-peer-deps

# Copiamos el resto del código
COPY . .

# Compilamos TypeScript
RUN npm run build

# --- STAGE 2: runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

# Copiamos sólo lo necesario del build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
# Copiamos los templates .docx que necesita la aplicación
COPY --from=builder /app/api/templates ./api/templates

# Instalamos solo dependencias de producción
RUN npm ci --omit=dev --legacy-peer-deps

# EXPOSE del puerto de tu API
EXPOSE 3000

# Comando de arranque
CMD ["node", "dist/index.js"]



