const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuración de MySQL
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
  let delay = 3000; // 3 segundos de espera inicial

  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`Intentando conectar a MySQL (Intento ${i}/${maxRetries})...`);
      
      // Probar conexión y crear el pool
      pool = mysql.createPool(dbConfig);
      
      // Realizar una consulta de prueba
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
      delay = Math.min(delay * 1.5, 15000); // Backoff exponencial
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
    console.error('Error al crear las tablas en la base de datos:', err);
    process.exit(1);
  }
}

// Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: pool ? 'connected' : 'disconnected' });
});

// Guardar Encuesta
app.post('/encuestas', async (req, res) => {
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
app.post('/alertas', async (req, res) => {
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

// Inicializar base de datos y arrancar servidor
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en el puerto ${PORT}`);
  });
});
