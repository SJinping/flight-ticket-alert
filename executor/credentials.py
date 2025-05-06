import os
from dotenv import load_dotenv
import logging

# 配置日志
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

def get_database_config():
    """获取数据库配置，优先使用环境变量"""
    try:
        # 必需的配置项
        required_vars = ['FLIGHT_DB_HOST', 'FLIGHT_DB_USER', 'FLIGHT_DB_PASSWORD', 'FLIGHT_DB_NAME']
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        
        if missing_vars:
            logger.warning(f"缺少数据库环境变量: {', '.join(missing_vars)}")
            logger.warning("将使用备用配置，这不是推荐的生产环境做法")
            
            # 如果找不到环境变量，使用加密的备用配置文件
            # 这里可以实现加密文件的读取逻辑
            
            # 简单起见，返回备用配置
            return {
                'host': 'localhost',
                'user': 'flight',
                'password': '',
                'database': 'flights',
                'port': 3306,
                'connect_timeout': 10
            }
        
        # 使用环境变量
        return {
            'host': os.environ.get('FLIGHT_DB_HOST'),
            'user': os.environ.get('FLIGHT_DB_USER'),
            'password': os.environ.get('FLIGHT_DB_PASSWORD'),
            'database': os.environ.get('FLIGHT_DB_NAME'),
            'port': int(os.environ.get('FLIGHT_DB_PORT', '3306')),
            'connect_timeout': int(os.environ.get('FLIGHT_DB_CONNECT_TIMEOUT', '10'))
        }
    except Exception as e:
        logger.error(f"获取数据库配置时出错: {e}")
        raise 