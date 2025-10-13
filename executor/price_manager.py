from collections import defaultdict
import time
from datetime import datetime
import mysql.connector
import logging
from credentials import get_database_config

class PriceManager:
    def __init__(self, db_config=None):
        """Initialize the PriceManager
        
        Args:
            db_config: MySQL database configuration dictionary
        """
        self.update_price_info = defaultdict(lambda: defaultdict(dict))
        self.db_config = db_config or get_database_config()
        self.logger = logging.getLogger(self.__class__.__name__)
        self._check_db_tables()
    
    def _check_db_tables(self):
        """Check if the required database tables exist and create them if needed"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            
            # Check if t_flight_price_current table exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS t_flight_price_current (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    place_from VARCHAR(3) NOT NULL,
                    place_to VARCHAR(3) NOT NULL,
                    dep_date DATE NOT NULL,
                    arr_date DATE NOT NULL,
                    price DECIMAL(10,2) NOT NULL,
                    last_checked TIMESTAMP NOT NULL,
                    first_seen TIMESTAMP NOT NULL,
                    is_roundtrip TINYINT(1) NOT NULL,
                    currency VARCHAR(3) DEFAULT 'CNY',
                    UNIQUE KEY route_date_idx (place_from, place_to, dep_date, arr_date, is_roundtrip)
                )
            """)
            
            # Check if t_flight_price_history table exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS t_flight_price_history (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    place_from VARCHAR(3) NOT NULL,
                    place_to VARCHAR(3) NOT NULL,
                    dep_date DATE NOT NULL,
                    arr_date DATE NOT NULL,
                    old_price DECIMAL(10,2) NOT NULL,
                    new_price DECIMAL(10,2) NOT NULL,
                    changed_at TIMESTAMP NOT NULL,
                    is_roundtrip TINYINT(1) NOT NULL,
                    currency VARCHAR(3) DEFAULT 'CNY'
                )
            """)
            
            conn.commit()
            cursor.close()
            conn.close()
            self.logger.info("Database tables checked and created if needed")
            
        except Exception as e:
            self.logger.error(f"Error checking/creating database tables: {e}")
    
    def _connect_with_retry(self, max_retries=3, retry_delay=2):
        """连接数据库，并在失败时重试
        
        Args:
            max_retries: 最大重试次数
            retry_delay: 重试延迟(秒)
        
        Returns:
            connection: MySQL连接对象
        """
        retries = 0
        last_error = None
        
        while retries < max_retries:
            try:
                # 添加连接超时设置
                conn_config = self.db_config.copy()
                conn_config['connect_timeout'] = 10  # 10秒连接超时
                
                conn = mysql.connector.connect(**conn_config)
                return conn
            except mysql.connector.Error as err:
                last_error = err
                retries += 1
                self.logger.warning(f"数据库连接失败(尝试 {retries}/{max_retries}): {err}")
                
                if retries < max_retries:
                    time.sleep(retry_delay)
        
        # 所有重试都失败
        self.logger.error(f"无法连接到数据库，已重试 {max_retries} 次: {last_error}")
        raise last_error
    
    def update_price(self, place_to, dep_date, arr_date, new_price, place_from='SZX', is_roundtrip=1, currency='CNY'):
        """Update flight price in the database
        
        Args:
            place_to: Destination IATA code
            dep_date: Departure date (YYYYMMDD)
            arr_date: Return date (YYYYMMDD)
            new_price: Flight price
            place_from: Origin IATA code (default: SZX)
            is_roundtrip: 1 for roundtrip, 0 for one-way
            currency: Currency code (default: CNY)
            
        Returns:
            bool: True if price was inserted or changed, False if unchanged
        """
        # Update local cache for notifications
        self.update_price_info[place_to][dep_date][arr_date] = new_price
        
        try:
            # Format dates for MySQL (YYYY-MM-DD)
            dep_date_formatted = f"{dep_date[:4]}-{dep_date[4:6]}-{dep_date[6:]}"
            arr_date_formatted = f"{arr_date[:4]}-{arr_date[4:6]}-{arr_date[6:]}"
            
            conn = self._connect_with_retry()
            cursor = conn.cursor()
            
            # Check if record exists and get current price
            cursor.execute("""
                SELECT id, price, first_seen FROM t_flight_price_current 
                WHERE place_from = %s AND place_to = %s AND dep_date = %s AND arr_date = %s AND is_roundtrip = %s
            """, (place_from, place_to, dep_date_formatted, arr_date_formatted, is_roundtrip))
            
            result = cursor.fetchone()
            now = datetime.now()
            
            if result:  # Record exists
                record_id, current_price, first_seen = result
                
                if float(current_price) != float(new_price):  # Price changed
                    # Insert into history
                    cursor.execute("""
                        INSERT INTO t_flight_price_history 
                        (place_from, place_to, dep_date, arr_date, old_price, new_price, changed_at, is_roundtrip, currency)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (place_from, place_to, dep_date_formatted, arr_date_formatted, current_price, new_price, now, is_roundtrip, currency))
                    
                    # Update current price
                    cursor.execute("""
                        UPDATE t_flight_price_current 
                        SET price = %s, last_checked = %s
                        WHERE id = %s
                    """, (new_price, now, record_id))
                    
                    conn.commit()
                    self.logger.info(f"Updated price for {place_from}->{place_to}, {dep_date}->{arr_date}: {current_price} -> {new_price}")
                    
                    cursor.close()
                    conn.close()
                    return True  # Price changed
                else:
                    # Just update timestamp
                    cursor.execute("""
                        UPDATE t_flight_price_current 
                        SET last_checked = %s
                        WHERE id = %s
                    """, (now, record_id))
                    
                    conn.commit()
                    self.logger.debug(f"Price unchanged for {place_from}->{place_to}, {dep_date}->{arr_date}: {new_price}")
                    
                    cursor.close()
                    conn.close()
                    return False  # Price unchanged
            else:
                # First time seeing this route+date
                cursor.execute("""
                    INSERT INTO t_flight_price_current
                    (place_from, place_to, dep_date, arr_date, price, last_checked, first_seen, is_roundtrip, currency)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (place_from, place_to, dep_date_formatted, arr_date_formatted, new_price, now, now, is_roundtrip, currency))
                
                conn.commit()
                self.logger.info(f"New price entry for {place_from}->{place_to}, {dep_date}->{arr_date}: {new_price}")
                
                cursor.close()
                conn.close()
                return True  # New price entry
                
        except Exception as e:
            self.logger.error(f"Error updating flight price in database: {e}")
            return False
    
    def save_prices(self, code2city=None):
        """Save any pending price updates to database
        
        This method now just clears the update_price_info cache since all prices
        are already written to the database in update_price method
        """
        if not self.update_price_info:
            return
            
        # Log a summary of price updates
        update_count = sum(len(dates) for dates in self.update_price_info.values())
        self.logger.info(f"Processed {update_count} price updates")
        
        # Reset update info
        self.update_price_info = defaultdict(lambda: defaultdict(dict))
    
    def get_price_history(self, place_from, place_to, dep_date, arr_date, is_roundtrip=1):
        """Get price history for a specific route and date
        
        Returns:
            list: List of dictionaries with price history
        """
        try:
            # Format dates for MySQL (YYYY-MM-DD)
            dep_date_formatted = f"{dep_date[:4]}-{dep_date[4:6]}-{dep_date[6:]}" if len(dep_date) == 8 else dep_date
            arr_date_formatted = f"{arr_date[:4]}-{arr_date[4:6]}-{arr_date[6:]}" if len(arr_date) == 8 else arr_date
            
            conn = self._connect_with_retry()
            cursor = conn.cursor(dictionary=True)
            
            cursor.execute("""
                SELECT old_price, new_price, changed_at
                FROM t_flight_price_history
                WHERE place_from = %s AND place_to = %s AND dep_date = %s AND arr_date = %s AND is_roundtrip = %s
                ORDER BY changed_at ASC
            """, (place_from, place_to, dep_date_formatted, arr_date_formatted, is_roundtrip))
            
            history = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return history
            
        except Exception as e:
            self.logger.error(f"Error retrieving price history: {e}")
            return []
    
    def get_latest_prices(self, place_from=None, place_to=None, limit=10):
        """Get the latest prices from the database
        
        Args:
            place_from: Optional filter by origin
            place_to: Optional filter by destination
            limit: Number of results to return
            
        Returns:
            list: List of dictionaries with price data
        """
        try:
            conn = self._connect_with_retry()
            cursor = conn.cursor(dictionary=True)
            
            query = """
                SELECT c.place_from, c.place_to, c.dep_date, c.arr_date, 
                       c.price, c.last_checked, c.is_roundtrip, c.currency
                FROM t_flight_price_current c
                WHERE 1=1
            """
            params = []
            
            if place_from:
                query += " AND c.place_from = %s"
                params.append(place_from)
                
            if place_to:
                query += " AND c.place_to = %s"
                params.append(place_to)
                
            query += " ORDER BY c.last_checked DESC LIMIT %s"
            params.append(limit)
            
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error retrieving latest prices: {e}")
            return []
    
    def get_best_deals(self, place_from=None, max_price=None, limit=5):
        """Get the best current flight deals
        
        Args:
            place_from: Optional filter by origin
            max_price: Maximum price to consider
            limit: Number of results to return
            
        Returns:
            list: List of dictionaries with price data
        """
        try:
            conn = self._connect_with_retry()
            cursor = conn.cursor(dictionary=True)
            
            query = """
                SELECT c.place_from, c.place_to, c.dep_date, c.arr_date, 
                       c.price, c.last_checked, c.is_roundtrip
                FROM t_flight_price_current c
                WHERE 1=1 ODER BY c.dep_date DESC
            """
            params = []
            
            if place_from:
                query += " AND c.place_from = %s"
                params.append(place_from)
                
            if max_price:
                query += " AND c.price <= %s"
                params.append(max_price)
                
            query += " ORDER BY c.price ASC LIMIT %s"
            params.append(limit)
            
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error retrieving best deals: {e}")
            return []