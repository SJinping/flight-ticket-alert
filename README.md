# Flight Ticket Alert

一个自动化监控机票价格并发送提醒的系统。

## 项目概述

Flight Ticket Alert 是一个用于监控航班价格变动的工具，当目标航线价格发生变化或达到设定阈值时，系统会自动发送提醒。该项目包含后端 API 服务和数据收集组件。

- **示例网站：** https://www.weekfly.fun/
- **示例小程序：** 小程序中搜索『牛马专线』

示例网站的出发地限定深圳，且往返日期限定**周四-周日**或**周五-周一**，非常适合辛勤工作的牛马周末摸鱼。

## 功能特点

- 实时监控指定航线的机票价格
- 自动记录价格历史变动
- 当价格低于设定阈值时发送提醒
- 提供 API 接口查询当前价格数据
- 支持单程和往返行程监控

## 技术架构

### 后端 API (flight-api)

- **Node.js + Express**: 提供 RESTful API 服务
- **MySQL**: 存储航班价格和提醒配置数据
- **HTTPS/HTTP**: 支持安全和标准连接

### 系统要求

- Node.js 14+
- MySQL 5.7+
- 用于部署的服务器（各种云☁️）

## 安装部署

### 1. 克隆仓库

```bash
git clone https://github.com/yourusername/flight-ticket-alert.git
cd flight-ticket-alert
```

### 2. 安装依赖

```bash
# 安装 API 服务依赖
cd flight-api
npm install
```

### 3. 配置环境

创建 `.env` 文件并配置数据库连接信息：

```
DB_HOST=localhost
DB_USER=flight
DB_PASSWORD=your_password
DB_NAME=flights
DB_PORT=3306
PORT=5001
HTTPS_PORT=5443
```

### 4. 数据库初始化

```sql
CREATE DATABASE flights;
USE flights;

CREATE TABLE t_flight_price_current (
  id INT AUTO_INCREMENT PRIMARY KEY,
  place_from VARCHAR(3) NOT NULL,
  place_to VARCHAR(3) NOT NULL,
  dep_date DATE NOT NULL,
  arr_date DATE,
  price DECIMAL(10,2) NOT NULL,
  last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_roundtrip BOOLEAN DEFAULT FALSE
);

CREATE TABLE t_iata_code (
  iata_code VARCHAR(3) PRIMARY KEY,
  iata_name VARCHAR(100) NOT NULL
);

-- 添加常用机场数据
INSERT INTO t_iata_code (iata_code, iata_name) VALUES
('PEK', '北京首都'),
('SHA', '上海虹桥'),
('PVG', '上海浦东'),
('CAN', '广州白云'),
('SZX', '深圳宝安');
```

### 5. 启动服务

开发环境：
```bash
cd flight-api
node server.js
```

生产环境（使用 PM2）：
```bash
npm install -g pm2
cd flight-api
pm2 start server.js --name flight-api
pm2 startup
pm2 save
```

## API 接口

### 获取航班价格数据

```bash
GET /api/flights
```

响应示例：
```json
[
  {
    "place_from": "PEK",
    "place_to": "SHA",
    "dep_date": "2023-12-25",
    "arr_date": null,
    "price": 899.00,
    "last_checked": "2023-12-10T14:30:00Z",
    "is_roundtrip": false,
    "city_name": "上海虹桥"
  }
]
```

## 服务器部署

1. 确保云端服务器安全组开放 5001(HTTP) 和 5443(HTTPS) 端口
2. 配置服务器防火墙允许相应端口
3. 使用 PM2 管理 Node.js 进程
4. 通过 `http://服务器IP:5001` 或 `https://服务器IP:5443` 访问服务

## 维护与更新

- 定期备份数据库
- 通过 PM2 监控应用状态：`pm2 monit`
- 检查日志：`pm2 logs flight-api`
