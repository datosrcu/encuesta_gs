FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la aplicación al directorio de Nginx
COPY . /usr/share/nginx/html

# Eliminar archivos innecesarios de la carpeta pública
RUN rm -rf /usr/share/nginx/html/nginx.conf \
           /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/Dockerfile.backend \
           /usr/share/nginx/html/docker-compose.yml \
           /usr/share/nginx/html/backend \
           /usr/share/nginx/html/docker-entrypoint.sh \
           /usr/share/nginx/html/config.js

# Exponer el puerto 80
EXPOSE 80

# Iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]

