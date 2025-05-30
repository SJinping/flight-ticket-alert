import requests
import logging
from datetime import datetime

class NotificationManager:
    def __init__(self, sckey, headers=None):
        self.sckey = sckey
        self.headers = headers or {}
        self.logger = logging.getLogger(self.__class__.__name__)
    
    def send_notification(self, message, title="Flight Price Alert"):
        """Send notification through PushPlus service
        
        Args:
            message: Message content
            title: Notification title
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.sckey:
            self.logger.warning("No SCKEY provided, cannot send notification")
            return False
        
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            formatted_message = f"[{timestamp}]\n\n{message}"
            
            # PushPlus API
            url = f"https://www.pushplus.plus/send"
            data = {
                "token": self.sckey,
                "title": title,
                "content": formatted_message,
                "template": "html"
            }
            
            response = requests.post(url, json=data, headers=self.headers)
            response.raise_for_status()
            
            result = response.json()
            if result.get("code") == 200:
                self.logger.info("Notification sent successfully")
                return True
            else:
                self.logger.error(f"Failed to send notification: {result.get('msg')}")
                return False
                
        except Exception as e:
            self.logger.error(f"Error sending notification: {e}")
            return False
        
if __name__ == "__main__":
    messages = ["深圳->北京, departure: 2025-06-05, return: 2025-06-08, price: 750", 
                "深圳->上海, departure: 2025-06-05, return: 2025-06-08, price: 750",
                "深圳->上海, departure: 2025-06-05, return: 2025-06-08, price: 750",
                "深圳->上海, departure: 2025-06-05, return: 2025-06-08, price: 750",
                "深圳->上海, departure: 2025-06-05, return: 2025-06-08, price: 750"]
    notification_manager = NotificationManager("")
    notification_manager.send_notification(messages)