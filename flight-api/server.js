const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 启用CORS, 允许cloudflare的访问
app.use(cors({
  origin: ['https://your-app.pages.dev', 'https://your-custom-domain.com']
}));

// 基本路由测试
app.get('/', (req, res) => {
  res.send('API服务器正常运行');
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

// 测试数据库连接
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

// 启动服务器
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`服务器成功运行在端口 ${PORT}`);
  console.log(`测试服务器: http://localhost:${PORT}`);
  console.log(`测试数据库连接: http://localhost:${PORT}/api/test-db`);
  console.log(`获取航班数据: http://localhost:${PORT}/api/flights`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`错误: 端口 ${PORT} 已被占用!`);
    console.error('请尝试更改PORT环境变量或关闭占用该端口的应用');
  } else {
    console.error('服务器启动失败:', err.message);
  }
  process.exit(1); // 终止进程，明确表示启动失败
});