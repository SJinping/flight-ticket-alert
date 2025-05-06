#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Initialize the MySQL database for flight alert application

import os
import json
import logging
import mysql.connector
from mysql.connector import Error
from credentials import get_database_config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def init_database(db_config, iata_code_json=None):
    """Initialize the MySQL database with the required schema and sample data
    
    Args:
        db_config: Dictionary containing MySQL connection parameters
        iata_code_json: Optional path to a JSON file containing IATA codes to import
    """
    try:
        # Create a connection to the database
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Create database if it doesn't exist
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_config['database']}")
        cursor.execute(f"USE {db_config['database']}")
        
        # Create IATA code table
        cursor.execute('''
        DROP TABLE IF EXISTS t_iata_code;
        CREATE TABLE IF NOT EXISTS t_iata_code (
            id INTEGER PRIMARY KEY AUTO_INCREMENT, 
            iata_code VARCHAR(3) NOT NULL, 
            iata_name VARCHAR(100) NOT NULL, 
            domestic TINYINT(1) NOT NULL
        );
        ''')
        
        # If a JSON file is provided, import the data
        if iata_code_json and os.path.exists(iata_code_json):
            with open(iata_code_json, 'r', encoding='utf-8') as f:
                iata_data = json.load(f)
                
            # Insert data from JSON - assuming all are domestic codes
            for code, name in iata_data.items():
                cursor.execute(
                    "INSERT INTO t_iata_code (iata_code, iata_name, domestic) VALUES (%s, %s, 1)",
                    (code, name)
                )
            logger.info(f"Imported {len(iata_data)} IATA codes from {iata_code_json}")
        else:
            # Add some sample data
            sample_data = [
                ("BJS", "北京", 1),
                ("SHA", "上海", 1),
                ("CAN", "广州", 1),
                ("SZX", "深圳", 1),
                ("CTU", "成都", 1),
                ("HGH", "杭州", 1),
                ("NKG", "南京", 1),
                ("XMN", "厦门", 1),
                ("CKG", "重庆", 1),
                ("TYN", "太原", 1),
                ("DLC", "大连", 1),
                ("TSN", "天津", 1),
                ("XIY", "西安", 1),
                ("TNA", "济南", 1),
                ("TAO", "青岛", 1),
                ("HKG", "香港", 0),
                ("TPE", "台北", 0),
                ("ICN", "首尔", 0),
                ("NRT", "东京", 0),
                ("SIN", "新加坡", 0)
            ]
            
            cursor.executemany(
                "INSERT INTO t_iata_code (iata_code, iata_name, domestic) VALUES (%s, %s, %s)",
                sample_data
            )
            logger.info(f"Added {len(sample_data)} sample IATA codes")
        
        # Create indexes for better performance
        cursor.execute("CREATE INDEX idx_iata_code ON t_iata_code (iata_code)")
        cursor.execute("CREATE INDEX idx_domestic ON t_iata_code (domestic)")
        
        # Commit the changes and close the connection
        conn.commit()
        conn.close()
        
        logger.info(f"Database initialized successfully")
        
    except Error as e:
        logger.error(f"Error initializing MySQL database: {e}")
        raise

if __name__ == "__main__":
    # 更新为远程MySQL配置
    db_config = get_database_config()
    
    current_dir = os.path.dirname(os.path.realpath(__file__))
    iata_code_json = os.path.join(current_dir, 'iata_code_domestic.json')
    
    if os.path.exists(iata_code_json):
        init_database(db_config, iata_code_json)
    else:
        init_database(db_config)
    
    print("Database initialization complete.") 