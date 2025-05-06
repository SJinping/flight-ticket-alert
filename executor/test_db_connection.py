#!/usr/bin/env python3
import mysql.connector
import sys
from credentials import get_database_config

db_config = get_database_config()
print(db_config)

try:
    print(f"尝试连接到数据库 {db_config['host']}...")
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    
    print("连接成功！测试查询...")
    cursor.execute("SHOW TABLES")
    tables = cursor.fetchall()
    
    print(f"数据库中的表:")
    for table in tables:
        print(f" - {table[0]}")
    
    cursor.close()
    conn.close()
    print("测试完成，数据库连接正常。")
    
except mysql.connector.Error as err:
    print(f"数据库连接错误: {err}")
    sys.exit(1) 