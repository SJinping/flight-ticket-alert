import os

# 数据库配置信息
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'flight'),
    'password': os.environ.get('DB_PASSWORD', ''),  # 默认值设为空
    'database': os.environ.get('DB_NAME', 'flights'),
    'port': int(os.environ.get('DB_PORT', '3306')),
    'connect_timeout': 10
} 