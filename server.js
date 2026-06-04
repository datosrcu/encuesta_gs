const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(compression());

// Configuración de conexión MySQL (VPS)
const dbConfig = {
  host: process.env.DB_HOST || 'bases-de-datosmysql-encuestas-r7v7gg',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'mysql',
  password: process.env.DB_PASSWORD || 'unnhdwnhq1w7tfvu',
  database: process.env.DB_NAME || 'mysql',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

async function initDb() {
  const maxRetries = 10;
  let delay = 3000;

  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`Intentando conectar a MySQL (Intento ${i}/${maxRetries})...`);
      pool = mysql.createPool(dbConfig);
      
      // Validar conexión
      const connection = await pool.getConnection();
      console.log('Conexión exitosa a MySQL.');
      connection.release();

      // Crear tablas si no existen
      await createTables();
      return;
    } catch (err) {
      console.error(`Error al conectar a MySQL en el intento ${i}:`, err.message);
      if (i === maxRetries) {
        console.error('Se alcanzaron los intentos máximos de conexión. Saliendo...');
        process.exit(1);
      }
      console.log(`Esperando ${delay / 1000} segundos antes del siguiente intento...`);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 1.5, 15000);
    }
  }
}

async function createTables() {
  try {
    const conn = await pool.getConnection();
    
    // Tabla de Encuestas
    await conn.query(`
      CREATE TABLE IF NOT EXISTS encuestas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        barrio VARCHAR(255),
        encuestador VARCHAR(255),
        datos JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Tabla "encuestas" lista.');

    // Tabla de Alertas
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alertas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(255),
        urgencia VARCHAR(50),
        nota TEXT,
        encuestador VARCHAR(255),
        barrio VARCHAR(255),
        ubicacion VARCHAR(255),
        encuestado JSON,
        estado VARCHAR(50) DEFAULT 'nueva',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Tabla "alertas" lista.');

    conn.release();
  } catch (err) {
    console.error('Error al inicializar las tablas en la base de datos:', err);
    process.exit(1);
  }
}

// --- Endpoints de API ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: pool ? 'connected' : 'disconnected' });
});

// Obtener todas las encuestas
app.get('/api/encuestas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, barrio, encuestador, datos, created_at FROM encuestas ORDER BY id DESC');
    const encuestas = rows.map(r => {
      let datosParsed = r.datos;
      if (typeof datosParsed === 'string') {
        try { datosParsed = JSON.parse(datosParsed); } catch (e) { datosParsed = {}; }
      }
      return {
        id: r.id,
        barrio: r.barrio,
        encuestador: r.encuestador,
        datos: datosParsed,
        created_at: r.created_at
      };
    });
    res.json(encuestas);
  } catch (err) {
    console.error('Error al obtener encuestas:', err);
    res.status(500).json({ error: 'Error interno del servidor al obtener las encuestas' });
  }
});

// Obtener todas las alertas
app.get('/api/alertas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado, created_at FROM alertas ORDER BY id DESC');
    const alertas = rows.map(r => {
      let encuestadoParsed = r.encuestado;
      if (typeof encuestadoParsed === 'string') {
        try { encuestadoParsed = JSON.parse(encuestadoParsed); } catch (e) { encuestadoParsed = {}; }
      }
      return {
        id: r.id,
        tipo: r.tipo,
        urgencia: r.urgencia,
        nota: r.nota,
        encuestador: r.encuestador,
        barrio: r.barrio,
        ubicacion: r.ubicacion,
        encuestado: encuestadoParsed,
        estado: r.estado,
        created_at: r.created_at
      };
    });
    res.json(alertas);
  } catch (err) {
    console.error('Error al obtener alertas:', err);
    res.status(500).json({ error: 'Error interno del servidor al obtener las alertas' });
  }
});

// Guardar Encuesta
app.post('/api/encuestas', async (req, res) => {
  const { barrio, encuestador, datos } = req.body;

  if (!datos) {
    return res.status(400).json({ error: 'Faltan los datos de la encuesta' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO encuestas (barrio, encuestador, datos) VALUES (?, ?, ?)',
      [barrio || null, encuestador || null, JSON.stringify(datos)]
    );
    
    console.log(`Encuesta guardada con ID: ${result.insertId}`);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error al guardar encuesta:', err);
    res.status(500).json({ error: 'Error interno del servidor al guardar la encuesta' });
  }
});

// Guardar Alerta
app.post('/api/alertas', async (req, res) => {
  const { tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado } = req.body;

  if (!tipo) {
    return res.status(400).json({ error: 'Falta el tipo de alerta' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO alertas (tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        urgencia || 'Alta',
        nota || null,
        encuestador || null,
        barrio || null,
        ubicacion || null,
        encuestado ? JSON.stringify(encuestado) : null,
        estado || 'nueva'
      ]
    );

    console.log(`Alerta guardada con ID: ${result.insertId}`);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error al guardar alerta:', err);
    res.status(500).json({ error: 'Error interno del servidor al guardar la alerta' });
  }
});

// --- Servir Estáticos del Frontend con Cabeceras Especiales PWA ---

// Cabeceras anti-caché para el Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Cabeceras anti-caché para el Manifiesto
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// Servir archivos estáticos por defecto (imágenes, fuentes, etc.)
app.use(express.static(__dirname, {
  maxAge: '1y',
  setHeaders: (res, path) => {
    // Si es el index.html o dashboard.html, no cachear de forma agresiva
    if (path.endsWith('index.html') || path.endsWith('dashboard.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, no-transform');
    }
  }
}));

// Fallback para cualquier otra ruta (Redirigir a index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar DB y Arrancar Servidor
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor unificado de Encuesta corriendo en el puerto ${PORT}`);
  });
});
