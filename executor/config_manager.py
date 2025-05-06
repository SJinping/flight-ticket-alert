import json
import os
import mysql.connector
import logging
from credentials import get_database_config

class ConfigManager:
    def __init__(self, config_path, db_config=None):
        """Initialize the ConfigManager
        
        Args:
            config_path: Path to the configuration JSON file
            db_config: MySQL database configuration dictionary (host, user, password, database)
                      If None, default values will be used
        """
        self.config_path = config_path
        self.db_config = db_config or get_database_config()
        self.city2code = {}
        self.code2city = {}
        self.config = self._load_config()
        self._load_iata_codes()
    
    def _load_config(self):
        """Load application configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
            return config
        except Exception as e:
            logging.error(f"Failed to load config: {e}")
            return {}
    
    def _load_iata_codes(self):
        """Load IATA codes from MySQL database"""
        try:
            # Connect to MySQL database
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            
            # Query all IATA codes (you can filter by domestic=1 if needed)
            cursor.execute("SELECT iata_code, iata_name FROM t_iata_code")
            
            # Process the results
            for iata_code, iata_name in cursor:
                self.code2city[iata_code] = iata_name
                self.city2code[iata_name] = iata_code
            
            # Update placeTo in config if it exists
            if 'placeTo' in self.config:
                # Get all domestic airport codes
                cursor.execute("SELECT iata_code FROM t_iata_code WHERE domestic = 1")
                domestic_codes = [row[0] for row in cursor.fetchall()]
                self.config['placeTo'] = domestic_codes
            
            cursor.close()
            conn.close()
            
            logging.info(f"Loaded {len(self.code2city)} IATA codes from database")
            
        except Exception as e:
            logging.error(f"Failed to load IATA codes from database: {e}")
    
    def get_city_code(self, city):
        """Get IATA code for a city name"""
        return self.city2code.get(city)
    
    def get_city_name(self, code):
        """Get city name for an IATA code"""
        return self.code2city.get(code, code)
    
    def get_config(self, key):
        """Get configuration value by key"""
        return self.config.get(key)