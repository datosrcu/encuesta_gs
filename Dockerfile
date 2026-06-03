FROM nginx:alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos de la aplicación al directorio de Nginx
COPY . /usr/share/nginx/html

# Eliminar el archivo de configuración del directorio público
RUN rm /usr/share/nginx/html/nginx.conf

# Exponer el puerto 80
EXPOSE 80
