const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();

// 启用CORS, 目前允许所有地址访问
app.use(cors({}));

// 测试
app.get('/', (req, res) => {
  try {
    res.send('API服务器正常运行');
  } catch (error) {
    console.error('路由处理错误:', error);
    res.status(500).send('服务器内部错误');
  }
});

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'flight',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'flights',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 监听连接池错误
pool.on('error', (err) => {
  console.error('数据库池错误:', err);
});

// 测试数据库连接flight-api/server.js
app.get('/api/test-db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    console.log('成功连接到数据库');
    connection.release();
    res.json({ message: '数据库连接成功' });
  } catch (error) {
    console.error('数据库连接错误:', error);
    res.status(500).json({ error: '数据库连接失败', details: error.message });
  }
});

// 设置API路由
app.get('/api/flights', async (req, res) => {
  console.log('收到 /api/flights 请求');
  try {
    // 从数据库获取航班价格数据
    const [rows] = await pool.execute(`
      SELECT
        c.place_from,
        c.place_to,
        c.dep_date,
        c.arr_date,
        c.price,
        c.last_checked,
        c.is_roundtrip,
        i.iata_name as city_name
      FROM
        t_flight_price_current c
      JOIN
        t_iata_code i ON c.place_to = i.iata_code
      ORDER BY
        c.last_checked DESC
    `);

    console.log(`查询成功，返回 ${rows.length} 条记录`);
    res.json(rows);
  } catch (error) {
    console.error('获取航班数据错误:', error);
    res.status(500).json({ 
      error: '获取航班数据失败', 
      message: error.message,
      code: error.code,
      sqlState: error.sqlState
    });
  }
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error('Express 错误:', err);
  res.status(500).send('服务器内部错误');
});

// 创建 HTTP 服务器
const PORT = process.env.PORT || 5001;
const server = http.createServer(app);
server.timeout = 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP 服务器运行在端口 ${PORT}`);
});

// 尝试创建 HTTPS 服务器
try {
  // 读取证书文件
  const privateKey = fs.readFileSync('./ssl/key.pem', 'utf8');
  const certificate = fs.readFileSync('./ssl/cert.pem', 'utf8');
  
  const credentials = { key: privateKey, cert: certificate };
  
  // 创建 HTTPS 服务器
  const HTTPS_PORT = process.env.HTTPS_PORT || 5443;
  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`HTTPS 服务器运行在端口 ${HTTPS_PORT}`);
  });
} catch (error) {
  console.error('启动 HTTPS 服务器失败:', error.message);
  console.log('仅 HTTP 服务器可用');
}

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});