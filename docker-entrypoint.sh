#!/bin/sh
set -e

# Generar archivo de configuración dinámico con las variables de entorno de producción
cat <<EOF > /usr/share/nginx/html/config.js
window.SUPABASE_ENV = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
};
EOF

# Ejecutar el comando original (Nginx)
exec "$@"
