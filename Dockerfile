FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la aplicación al directorio de Nginx
COPY . /usr/share/nginx/html

# Copiar y preparar el entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Eliminar archivos innecesarios de la carpeta pública
RUN rm -f /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/docker-entrypoint.sh

# Exponer el puerto 80
EXPOSE 80

# Definir el script de arranque
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]

