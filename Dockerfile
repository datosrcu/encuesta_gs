FROM node:18-alpine

WORKDIR /usr/src/app

# Copiar configuración de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm install --only=production

# Copiar el código del servidor y archivos estáticos
COPY server.js index.html sw.js manifest.json Datos.png Favicon.png SGyPC.png ./

# El puerto por defecto del servidor es 3000 (configurable via PORT env var)
EXPOSE 3000

CMD ["node", "server.js"]

