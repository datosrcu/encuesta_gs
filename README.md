# Encuesta Gabinete Social

Este proyecto es una aplicación web progresiva (PWA) de encuesta para la Municipalidad de Río Cuarto. Permite a los encuestadores recolectar datos en campo, almacenándolos localmente si no hay conexión y sincronizándolos automáticamente con un servicio en la nube (Google Apps Script) cuando vuelve la conectividad.

## Estructura del Proyecto

- `index.html`: Página principal con la interfaz de usuario, lógica de validación, almacenamiento local y lógica de sincronización.
- `manifest.json` y `sw.js`: Archivos de configuración para el soporte PWA y almacenamiento en caché offline de recursos.
- `Datos.png`, `Favicon.png`, `SGyPC.png`: Recursos gráficos e iconos de la aplicación.
- `Dockerfile`: Archivo de definición de la imagen Docker para producción basada en Nginx Alpine.
- `nginx.conf`: Configuración personalizada del servidor Nginx (compresión Gzip, políticas de caché e invalidación de caché para el Service Worker).
- `docker-compose.yml`: Orquestación del contenedor para facilitar el despliegue local y en VPS.

---

## Ejecución Local con Docker

Para probar la aplicación localmente usando Docker, asegúrate de tener instalado Docker Desktop y ejecuta:

```bash
# Iniciar el contenedor en segundo plano y compilar la imagen
docker compose up -d --build
```

La aplicación estará accesible en [http://localhost:8080](http://localhost:8080).

Para detener el contenedor:

```bash
docker compose down
```

---

## Despliegue en VPS Dockerizado

Para desplegar este proyecto en tu VPS dockerizado:

1. **Clonar el repositorio en el VPS**:
   ```bash
   git clone https://github.com/datosrcu/encuesta_gs.git
   cd encuesta_gs
   ```

2. **Levantar el contenedor**:
   ```bash
   docker compose up -d --build
   ```

3. **Configurar el Proxy Inverso (Nginx Proxy Manager, Traefik, etc.)**:
   - Apunta tu subdominio (ej. `encuesta.tudominio.com`) al puerto `8080` de este VPS.
   - Asegúrate de habilitar HTTPS (SSL) ya que las PWAs **requieren** de un contexto seguro (HTTPS o localhost) para registrar el Service Worker y funcionar de manera offline.

---

## Configuración y Muestras

- Para acceder al panel de administración integrado y la configuración de muestras, realiza un **doble clic en el logo superior "DATOS Río Cuarto"** o utiliza el atajo de teclado `Ctrl+Shift+A` dentro de la aplicación.
