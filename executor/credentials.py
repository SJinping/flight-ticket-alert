import os
from dotenv import load_dotenv
import logging
from pathlib import Path

# 配置日志
logger = logging.getLogger(__name__)

def get_database_config():
    """获取数据库配置，按优先级：环境变量 > .env文件 > 备用配置"""
    try:
        # 必需的配置项
        required_vars = ['FLIGHT_DB_HOST', 'FLIGHT_DB_USER', 'FLIGHT_DB_PASSWORD', 'FLIGHT_DB_NAME']
        
        # 步骤1: 检查环境变量中是否有所有必要配置
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        
        # 如果环境变量完整，直接使用环境变量
        if not missing_vars:
            logger.info("使用环境变量中的数据库配置")
            return {
                'host': os.environ.get('FLIGHT_DB_HOST'),
                'user': os.environ.get('FLIGHT_DB_USER'),
                'password': os.environ.get('FLIGHT_DB_PASSWORD'),
                'database': os.environ.get('FLIGHT_DB_NAME'),
                'port': int(os.environ.get('FLIGHT_DB_PORT', '3306')),
                'connect_timeout': int(os.environ.get('FLIGHT_DB_CONNECT_TIMEOUT', '10'))
            }
        
        logger.warning(f"环境变量中缺少数据库配置: {', '.join(missing_vars)}")
        logger.info("尝试从.env文件加载数据库配置")
        
        script_dir = Path(__file__).parent.absolute()
        env_paths = [
            script_dir / '.env',                     # 当前目录
            # script_dir.parent / '.env',              # 上一级目录
            Path(os.path.expanduser('~')) / '.env'   # 用户主目录
        ]
        
        # 尝试加载每个路径的.env文件
        env_loaded = False
        for env_path in env_paths:
            if env_path.exists():
                logger.info(f"找到.env文件: {env_path}")
                load_dotenv(dotenv_path=env_path)
                env_loaded = True
                break
        
        if not env_loaded:
            logger.warning("未找到.env文件")
        
        # 再次检查环境变量（包括从.env加载的）
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        
        # 如果.env文件提供了完整配置，使用这些配置
        if not missing_vars:
            logger.info("使用.env文件中的数据库配置")
            return {
                'host': os.environ.get('FLIGHT_DB_HOST'),
                'user': os.environ.get('FLIGHT_DB_USER'),
                'password': os.environ.get('FLIGHT_DB_PASSWORD'),
                'database': os.environ.get('FLIGHT_DB_NAME'),
                'port': int(os.environ.get('FLIGHT_DB_PORT', '3306')),
                'connect_timeout': int(os.environ.get('FLIGHT_DB_CONNECT_TIMEOUT', '10'))
            }
        
        # 步骤3: 使用备用配置
        logger.warning(f".env文件中仍缺少配置: {', '.join(missing_vars)}")
        logger.warning("将使用备用配置，这不是推荐的生产环境做法")
        
        # 返回备用配置
        return {
            'host': 'localhost',
            'user': 'flight',
            'password': '',
            'database': 'flights',
            'port': 3306,
            'connect_timeout': 10
        }
    except Exception as e:
        logger.error(f"获取数据库配置时出错: {e}")
        raise 