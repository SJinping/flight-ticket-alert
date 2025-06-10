# -*- coding: utf-8 -*-
# @Author: jinpingshi
# @Date:   2024/11/20 17:17
# @Last Modified by:   jinpingshi
# @Last Modified time: 2024/11/20 17:17
# @Description: 
# @Mark:

import os
import time
import random
import logging
from datetime import datetime, timedelta
import requests
from config_manager import ConfigManager
from price_manager import PriceManager
from notification_manager import NotificationManager
from credentials import get_database_config
from dotenv import load_dotenv

class FlightAlert:
    def __init__(self, config_path, db_config=None):
        # 加载.env文件
        load_dotenv()
        
        self.db_config = db_config or get_database_config()
        self.config_manager = ConfigManager(config_path, self.db_config)
        self.price_manager = PriceManager(self.db_config)
        
        # 从.env文件中获取PUSH_TOKEN而不是从配置文件获取SCKEY
        push_token = os.environ.get('PUSH_TOKEN')
        if not push_token:
            self.logger = logging.getLogger(self.__class__.__name__)
            self.logger.warning("PUSH_TOKEN not found in .env file, notifications may not work")
            
        self.notification_manager = NotificationManager(
            push_token,
            {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )
        self.logger = logging.getLogger(self.__class__.__name__)

    def get_flight_response(self, place_from, place_to, flight_way='Roundtrip', is_direct=True, army=False):
        params = {
            "flightWay": flight_way,
            "dcity": place_from,
            "acity": place_to,
            "direct": 'true' if is_direct else 'false',
            "army": 'true' if army else 'false',
        }
        try:
            response = requests.get(
                self.config_manager.get_config('baseUrl'), 
                params=params, 
                headers=self.notification_manager.headers,
                timeout=3
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            self.logger.error(f"Failed to get flight info from {place_to} to {place_from} with error: {e}")
            return None

    def check_flight_price(self, place_from, place_to, dep_date=None, arr_date=None, max_price=None):
        """检查指定出发地和目的地之间的航班价格
        Args:
            place_from: 出发地机场代码
            place_to: 目的地机场代码
            dep_date: 可选，出发日期，格式为YYYYMMDD
            arr_date: 可选，返回日期，格式为YYYYMMDD
            max_price: 可选，最高价格，如果不指定则使用配置文件中的targetPrice
        """
        flight_info = self.get_flight_response(place_from, place_to)
        if not flight_info or flight_info['status'] == 2:
            return
        
        target_price = max_price if max_price is not None else self.config_manager.get_config('targetPrice')
        
        if dep_date and arr_date:
            # 指定日期查询模式
            results = flight_info['data'].get('roundTripPrice', {})
            price = results.get(dep_date, {}).get(arr_date, 0)
            
            if price and price < target_price:
                self.price_manager.update_price(place_to, dep_date, arr_date, price)
        else:
            # 自动查询模式
            self._process_flight_info(flight_info, place_from, place_to, target_price=target_price)
        

    def _process_flight_info(self, flight_info, place_from, place_to, days_diff=28, flight_way='Roundtrip', target_price=None):
        results = flight_info['data'].get('roundTripPrice' if flight_way == 'Roundtrip' else 'oneWayPrice', {})
        
        if target_price is None:
            target_price = self.config_manager.get_config('targetPrice')
        
        for dep_date, prices in results.items():
            weekday = time.strptime(dep_date, '%Y%m%d').tm_wday + 1
            if weekday not in (4, 5):  # 只查询周四和周五
                continue
                
            days_diff = (datetime.strptime(dep_date, "%Y%m%d").date() - datetime.now().date()).days
            if days_diff > days_diff:
                continue
                
            arr_date = (datetime.strptime(dep_date, "%Y%m%d") + timedelta(days=3)).strftime("%Y%m%d")
            
            if flight_way == 'Roundtrip':
                price = prices.get(arr_date, 0)
                if price and price < target_price:
                    self.price_manager.update_price(place_to, dep_date, arr_date, price, place_from=place_from)

    def check_flight_price_with_dates(self, place_from, place_to, dep_date, arr_date):
        """检查指定出发地、目的地和往返日期的航班价格
        Args:
            place_from: 出发地机场代码
            place_to: 目的地机场代码
            dep_date: 出发日期，格式为YYYYMMDD
            arr_date: 返回日期，格式为YYYYMMDD
        """
        flight_info = self.get_flight_response(place_from, place_to)
        if not flight_info or flight_info['status'] == 2:
            return
        
        results = flight_info['data'].get('roundTripPrice', {})
        price = results.get(dep_date, {}).get(arr_date, 0)
        
        if price and price < self.config_manager.get_config('targetPrice'):
            self.price_manager.update_price(place_to, dep_date, arr_date, price)
            self._send_price_alerts()

    def check_all_destinations(self):
        """检查所有出发地到所有目的地的航班价格"""
        place_from_list = self.config_manager.get_config('placeFrom')
        # 如果placeFrom还是字符串格式，转换为列表以兼容旧配置
        if isinstance(place_from_list, str):
            place_from_list = [place_from_list]
            
        destinations = self.config_manager.get_config('placeTo')
        # 如果placeTo是字符串，转换为列表
        if isinstance(destinations, str):
            destinations = [destinations]
        
        for place_from in place_from_list:
            for place_to in destinations:
                if place_to == place_from:
                    continue
                    
                print(f'Processing flights from {place_from} to {place_to}...')
                self.check_flight_price(place_from, place_to)
                time.sleep(random.randrange(1, 4) + random.random())
        
        # Save any pending updates to the database
        self._send_price_alerts()
        self.price_manager.save_prices()

    def _send_price_alerts(self):
        """Send notifications for price updates"""
        if not self.price_manager.update_price_info:
            return
            
        message = ''
        
        # 获取最近的价格更新，从数据库中查询以获取完整的路线信息
        try:
            # 计算需要通知的更新数量
            total_updates = sum(
                len(arr_dates) for dates in self.price_manager.update_price_info.values()
                for arr_dates in dates.values()
            )
            
            if total_updates == 0:
                return
                
            # 从数据库获取最新的价格更新信息
            recent_updates = self.price_manager.get_latest_prices(limit=total_updates * 2)  # 多取一些以确保包含所有更新
            
            # 处理每个价格更新
            for place_to, dates in self.price_manager.update_price_info.items():
                for dep_date, arr_dates in dates.items():
                    for arr_date, price in arr_dates.items():
                        # 查找对应的数据库记录以获取出发地信息
                        matching_record = None
                        for record in recent_updates:
                            if (record['place_to'] == place_to and 
                                record['dep_date'].strftime('%Y%m%d') == dep_date and 
                                record['arr_date'].strftime('%Y%m%d') == arr_date):
                                matching_record = record
                                break
                        
                        if matching_record:
                            city_from = self.config_manager.get_city_name(matching_record['place_from'])
                            city_to = self.config_manager.get_city_name(place_to)
                            dep_date_formatted = f"{dep_date[:4]}-{dep_date[4:6]}-{dep_date[6:]}"
                            arr_date_formatted = f"{arr_date[:4]}-{arr_date[4:6]}-{arr_date[6:]}"
                            message += f'{city_from}->{city_to}, departure: {dep_date_formatted}, return: {arr_date_formatted}, price: {price}\n'
                        else:
                            # 如果找不到匹配记录，使用默认的第一个出发地
                            place_from_list = self.config_manager.get_config('placeFrom')
                            if isinstance(place_from_list, str):
                                default_place_from = place_from_list
                            else:
                                default_place_from = place_from_list[0] if place_from_list else 'SZX'
                            
                            city_from = self.config_manager.get_city_name(default_place_from)
                            city_to = self.config_manager.get_city_name(place_to)
                            dep_date_formatted = f"{dep_date[:4]}-{dep_date[4:6]}-{dep_date[6:]}"
                            arr_date_formatted = f"{arr_date[:4]}-{arr_date[4:6]}-{arr_date[6:]}"
                            message += f'{city_from}->{city_to}, departure: {dep_date_formatted}, return: {arr_date_formatted}, price: {price}\n'
            
            if message:
                self.notification_manager.send_notification(message)
                
        except Exception as e:
            self.logger.error(f"Error sending price alerts: {e}")
            # 降级处理：如果数据库查询失败，使用配置中的第一个出发地
            place_from_list = self.config_manager.get_config('placeFrom')
            if isinstance(place_from_list, str):
                default_place_from = place_from_list
            else:
                default_place_from = place_from_list[0] if place_from_list else 'SZX'
                
            city_from = self.config_manager.get_city_name(default_place_from)
            message = ''
            
            for place_to, dates in self.price_manager.update_price_info.items():
                city_to = self.config_manager.get_city_name(place_to)
                for dep_date, arr_dates in dates.items():
                    for arr_date, price in arr_dates.items():
                        dep_date_formatted = f"{dep_date[:4]}-{dep_date[4:6]}-{dep_date[6:]}"
                        arr_date_formatted = f"{arr_date[:4]}-{arr_date[4:6]}-{arr_date[6:]}"
                        message += f'{city_from}->{city_to}, departure: {dep_date_formatted}, return: {arr_date_formatted}, price: {price}\n'
            
            if message:
                self.notification_manager.send_notification(message)

    def get_international_flight_response(self, place_from, place_to, flight_way='Roundtrip', is_direct=True):
        """获取国际航班信息
        Args:
            place_from: 出发地机场代码
            place_to: 目的地机场代码
            flight_way: 航班类型，Roundtrip或Oneway
            is_direct: 是否只查询直飞航班
        """
        params = {
            "flightWay": flight_way,
            "dcity": place_from,
            "acity": place_to,
            "direct": 'true' if is_direct else 'false',
            "currency": "CNY",
            "searchIndex": 1,
        }
        try:
            response = requests.get(
                self.config_manager.get_config('internationalBaseUrl'), 
                params=params, 
                headers=self.notification_manager.headers,
                timeout=5  # 国际航班查询可能需要更长的超时时间
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            self.logger.error(f"Failed to get international flight info from {place_to} to {place_from} with error: {e}")
            return None
    
    def check_international_flight_price(self, place_from, place_to, dep_date=None, arr_date=None, max_price=None):
        """检查国际航班价格
        Args:
            place_from: 出发地机场代码
            place_to: 目的地机场代码
            dep_date: 可选，出发日期，格式为YYYYMMDD
            arr_date: 可选，返回日期，格式为YYYYMMDD
            max_price: 可选，最高价格，如果不指定则使用配置文件中的internationalTargetPrice
        """
        flight_info = self.get_international_flight_response(place_from, place_to)
        if not flight_info or flight_info.get('status') != 0:  # 国际航班API的成功状态码是0
            return
        
        target_price = max_price if max_price is not None else self.config_manager.get_config('internationalTargetPrice')
        
        if dep_date and arr_date:
            # 指定日期查询模式
            results = flight_info['data'].get('flightItems', {})
            for item in results:
                if item['depDate'] == dep_date and item['arrDate'] == arr_date:
                    price = float(item.get('price', 0))
                    if price and price < target_price:
                        self.price_manager.update_price(place_to, dep_date, arr_date, price)
                break
        else:
            # 自动查询模式
            self._process_international_flight_info(flight_info, place_from, place_to, target_price=target_price)
        
        self._send_price_alerts()
    
    def _process_international_flight_info(self, flight_info, place_from, place_to, flight_way='Roundtrip', target_price=None):
        """处理国际航班信息"""
        if target_price is None:
            target_price = self.config_manager.get_config('internationalTargetPrice')
        
        results = flight_info['data'].get('flightItems', [])
        for item in results:
            dep_date = item['depDate']
            arr_date = item['arrDate']
            
            weekday = time.strptime(dep_date, '%Y%m%d').tm_wday + 1
            if weekday not in (4, 5):  # 只查询周四和周五
                continue
                
            days_diff = (datetime.strptime(dep_date, "%Y%m%d").date() - datetime.now().date()).days
            if days_diff > 60:  # 国际航班可以查询更长时间范围
                continue
            
            price = float(item.get('price', 0))
            if price and price < target_price:
                self.price_manager.update_price(place_to, dep_date, arr_date, price)

    def show_best_deals(self, place_from=None, max_price=None, limit=5):
        """显示最优惠的机票价格
        
        Args:
            place_from: 可选，出发地机场代码或代码列表
            max_price: 可选，最高价格
            limit: 返回结果数量
        """
        if place_from is None:
            place_from_list = self.config_manager.get_config('placeFrom')
            # 如果placeFrom还是字符串格式，转换为列表以兼容旧配置
            if isinstance(place_from_list, str):
                place_from_list = [place_from_list]
        else:
            # 如果传入的place_from是字符串，转换为列表
            if isinstance(place_from, str):
                place_from_list = [place_from]
            else:
                place_from_list = place_from
            
        if max_price is None:
            max_price = self.config_manager.get_config('targetPrice')
        
        # 收集所有出发地的最优价格
        all_deals = []
        for pf in place_from_list:
            deals = self.price_manager.get_best_deals(pf, max_price, limit)
            all_deals.extend(deals)
        
        # 按价格排序并取前limit个
        all_deals.sort(key=lambda x: x['price'])
        best_deals = all_deals[:limit]
        
        print(f"\n当前最优惠的{limit}个航班价格:")
        print("-" * 80)
        print(f"{'出发地':<8} {'目的地':<8} {'出发日期':<12} {'返回日期':<12} {'价格':>8} {'更新时间':<20}")
        print("-" * 80)
        
        for deal in best_deals:
            from_city = self.config_manager.get_city_name(deal['place_from'])
            to_city = self.config_manager.get_city_name(deal['place_to'])
            dep_date = deal['dep_date'].strftime("%Y-%m-%d")
            arr_date = deal['arr_date'].strftime("%Y-%m-%d")
            price = deal['price']
            last_checked = deal['last_checked'].strftime("%Y-%m-%d %H:%M")
            
            print(f"{from_city:<8} {to_city:<8} {dep_date:<12} {arr_date:<12} {price:>8.2f} {last_checked:<20}")
        
        print("-" * 80)
        
        return best_deals

    def check_all_from_single_destination(self, place_to):
        """检查所有出发地到指定目的地的航班价格
        
        Args:
            place_to: 目的地机场代码
        """
        place_from_list = self.config_manager.get_config('placeFrom')
        # 如果placeFrom还是字符串格式，转换为列表以兼容旧配置
        if isinstance(place_from_list, str):
            place_from_list = [place_from_list]
        
        for place_from in place_from_list:
            if place_to == place_from:
                continue
                
            print(f'Processing flights from {place_from} to {place_to}...')
            self.check_flight_price(place_from, place_to)
            time.sleep(random.randrange(1, 4) + random.random())
        
        # Save any pending updates to the database
        self._send_price_alerts()
        self.price_manager.save_prices()

def main():
    current_dir = os.path.dirname(os.path.realpath(__file__))
    config_path = os.path.join(current_dir, 'config.json')
    log_file_path = os.path.join(current_dir, 'log.txt')
    
    # 配置数据库
    db_config = get_database_config()

    logging.basicConfig(filename=log_file_path, level=logging.INFO)
    
    flight_alert = FlightAlert(config_path, db_config)
    
    # 检查所有目的地
    flight_alert.check_all_destinations()
    
    # 显示最优惠的航班价格
    flight_alert.show_best_deals()
    
    # 检查特定目的地（还未测试）
    # from_city_code = "SZX"  # 深圳
    # to_city_code = "BJS"    # 北京
    # flight_alert.check_flight_price(from_city_code, to_city_code)

    # 检查所有出发地到特定目的地（还未测试）
    # place_to = "BJS"
    # flight_alert.check_all_from_single_destination(place_to)
    
    # 检查特定目的地和日期（还未测试）
    # dep_date = "20250306"  # 出发日期
    # arr_date = "20250309"  # 返回日期
    # max_price = 1500
    # flight_alert.check_flight_price(from_city_code, 
    #                                 to_city_code, 
    #                                 dep_date, 
    #                                 arr_date, 
    #                                 max_price)

if __name__ == "__main__":
    main()
    print('Jobs done.')