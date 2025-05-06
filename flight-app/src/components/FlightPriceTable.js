import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  TextField, 
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
// import { Amap, Polyline, Marker } from '@amap/amap-react';
import { Map, Marker, Polyline } from '@uiw/react-amap';
import dayjs from 'dayjs';
// 在文件顶部添加 recharts 相关导入
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// 在组件顶部添加安全配置
window._AMapSecurityConfig = {
  securityJsCode: process.env.REACT_APP_AMAP_SECURITY_CODE
};

const generateBookingUrl = (iataCode, depDate, retDate) => {
  return `https://flights.ctrip.com/online/list/round-szx-${iataCode}?_=1&depdate=${depDate}_${retDate}`;
};

// API URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

const FlightPriceTable = () => {
  const [selectedCityFlights, setSelectedCityFlights] = useState([]);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [selectedCityName, setSelectedCityName] = useState('');
  const [flights, setFlights] = useState([]);
  const [filteredFlights, setFilteredFlights] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [cities, setCities] = useState([]);
  const [viewType, setViewType] = useState('table');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFlights, setDateFlights] = useState([]);
  const [cityCoordinates, setCityCoordinates] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const REACT_APP_AMAP_KEY = process.env.REACT_APP_AMAP_KEY

  // 添加获取城市坐标的函数
  const getCityCoordinate = useCallback(async (cityName) => {
    if (cityCoordinates[cityName]) {
      return cityCoordinates[cityName];
    }

    try {
      const response = await fetch(
        `https://restapi.amap.com/v3/geocode/geo?address=${cityName}&key=${REACT_APP_AMAP_KEY}&output=JSON`
      );
      const data = await response.json();

      if (data.status === '1' && data.geocodes.length > 0) {
        const [lng, lat] = data.geocodes[0].location.split(',');
        const coordinates = [Number(lng), Number(lat)];
        setCityCoordinates(prev => ({
          ...prev,
          [cityName]: coordinates
        }));
        return coordinates;
      }
    } catch (error) {
      console.error('获取城市坐标失败:', error);
    }
    return null;
  }, [REACT_APP_AMAP_KEY, cityCoordinates]);

  // 使用 useCallback 包装 fetchActiveRoutes
  const fetchActiveRoutes = useCallback(async () => {
    setLoading(true);
    const currentDate = dayjs().format('YYYY-MM-DD');
    const activeFlights = flights.filter(f => f.depDate >= currentDate);

    const cities = ['深圳', ...new Set(activeFlights.map(f => f.city))];
    await Promise.all(cities.map(city => getCityCoordinate(city)));

    const routes = activeFlights.map(f => ({
      from: '深圳',
      to: f.city,
      price: f.price
    }));

    setActiveRoutes(routes);
    setLoading(false);
  }, [flights, getCityCoordinate]); // 添加依赖项

  // 添加 useEffect 来在视图类型改变时获取路线
  useEffect(() => {
    if (viewType === 'map') {
      fetchActiveRoutes();
    }
  }, [viewType, fetchActiveRoutes]);

  // 从MySQL数据库获取航班数据
  useEffect(() => {
    // 设置加载状态
    setLoading(true);

    // 从后端API获取数据
    fetch(`${API_BASE_URL}/api/flights`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        console.log('Received flight data:', data.length, 'records');

        // 处理数据以匹配组件格式
        const processedFlights = data.map((flight, index) => {
          // 从后端获取的日期可能已经是格式化过的
          return {
            id: index,
            city: flight.city_name || flight.place_to, // 使用城市名称或目的地代码
            depDate: dayjs(flight.dep_date).format('YYYY-MM-DD'),
            retDate: dayjs(flight.arr_date).format('YYYY-MM-DD'),
            price: Number(flight.price),
            timestamp: new Date(flight.last_checked).getTime() / 1000, // 转换为Unix时间戳
            iataCode: flight.place_to // 保存IATA代码
          };
        });

        setFlights(processedFlights);
        setFilteredFlights(processedFlights);

        const uniqueCities = [...new Set(processedFlights.map(f => f.city))];
        setCities(uniqueCities.sort());

        // 关闭加载状态
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching flight data:', error);
        setLoading(false);
      });
  }, []);

  // 处理筛选
  useEffect(() => {
    let filtered = [...flights];
    
    if (selectedCity) {
      filtered = filtered.filter(f => f.city === selectedCity);
    }
    
    if (priceRange.min) {
      filtered = filtered.filter(f => f.price >= Number(priceRange.min));
    }
    
    if (priceRange.max) {
      filtered = filtered.filter(f => f.price <= Number(priceRange.max));
    }
    
    setFilteredFlights(filtered);
  }, [selectedCity, priceRange, flights]);

  const columns = [
    { field: 'city', headerName: '目的地', width: 120 },
    { field: 'depDate', headerName: '出发日期', width: 120 },
    { field: 'retDate', headerName: '返程日期', width: 120 },
    { field: 'price', headerName: '价格(￥)', width: 100 },
    { 
      field: 'timestamp', 
      headerName: '更新时间', 
      width: 180,
      valueFormatter: (params) => {
        return dayjs(params.value).format('YYYY-MM-DD');
      },
    },
    {
      field: 'actions',
      headerName: '订票',
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const currentDate = dayjs().format('YYYY-MM-DD');
        if (params.row.depDate < currentDate) {
          return null;
        }
        const url = generateBookingUrl(params.row.iataCode, params.row.depDate, params.row.retDate);
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{
            color: '#1976d2',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' }
          }}>
            订票
          </a>
        );
      }
    }
  ];

  // 处理日历日期点击
  const handleDateClick = (date) => {
    const flightsOnDate = flights
    .filter(f => f.depDate === dayjs(date).format('YYYY-MM-DD'))
    .reduce((acc, flight) => {
      // 使用城市和往返日期组合作为键
      const key = `${flight.city}-${flight.depDate}-${flight.retDate}`;
      if (!acc[key] || acc[key].timestamp < flight.timestamp) {
        acc[key] = flight;
      }
      return acc;
    }, {});

  const uniqueFlights = Object.values(flightsOnDate);
  
  if (uniqueFlights.length > 0) {
    setDateFlights(uniqueFlights);
    setDialogOpen(true);
  }
  };

  // 获取有航班的日期
  const hasFlights = (date) => {
    const formattedDate = dayjs(date).format('YYYY-MM-DD');
    return flights.some(f => f.depDate === formattedDate);
  };

const [mapReady, setMapReady] = useState(false);
const [mapError, setMapError] = useState(null);

  return (
    <Box sx={{ width: '100%', padding: 2 }}>
      <Typography variant="h4" gutterBottom>
        深圳牛马特种兵旅游专线
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={viewType} 
          onChange={(_event, newValue) => setViewType(newValue)} 
          aria-label="view tabs"
          sx={{ mb: 2 }}
        >
          <Tab value="table" label="表格视图" id="tab-table" />
          <Tab value="calendar" label="日历视图" id="tab-calendar" />
          <Tab value="map" label="地图视图" id="tab-map" />
          <Tab value="trend" label="价格走势" id="tab-trend" />
        </Tabs>
      </Box>
      
      {viewType === 'table' ? (
        <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControl sx={{ width: 200 }}>
          <InputLabel>选择目的地</InputLabel>
          <Select
            value={selectedCity}
            label="选择目的地"
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            <MenuItem value="">全部城市</MenuItem>
            {cities.map(city => (
              <MenuItem key={city} value={city}>{city}</MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <TextField
          label="最低价格"
          type="number"
          value={priceRange.min}
          onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
          sx={{ width: 150 }}
        />
        
        <TextField
          label="最高价格"
          type="number"
          value={priceRange.max}
          onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
          sx={{ width: 150 }}
        />
      </Box>

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={filteredFlights}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10]}
          disableSelectionOnClick
          sortModel={[
            {
              field: 'timestamp',  // 修改这里，使用 timestamp 而不是 updateTime
              sort: 'desc'
            },
            {
              field: 'price',
              sort: 'asc'
            }
          ]}
        />
      </Paper>
      </>
      ) : viewType === 'calendar' ? (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <Paper 
            sx={{ 
              p: 3,
              maxWidth: 400,
              margin: '0 auto',
              borderRadius: 2,
              boxShadow: 3
            }}
          >
            <DateCalendar 
              onChange={handleDateClick}
              shouldDisableDate={(date) => !hasFlights(date)}
              sx={{
                width: '100%',
                '& .MuiPickersDay-root': {
                  borderRadius: '50%',
                  '&:not(.Mui-disabled)': {
                    backgroundColor: '#e3f2fd',
                    color: '#1976d2',
                    fontWeight: 'bold',
                    '&:hover': {
                      backgroundColor: '#90caf9',
                    }
                  }
                },
                '& .MuiDayCalendar-weekDayLabel': {
                  color: '#1976d2',
                  fontWeight: 'bold'
                },
                '& .MuiPickersCalendarHeader-root': {
                  backgroundColor: '#f5f5f5',
                  borderRadius: 1,
                  marginBottom: 1,
                  padding: 1
                }
              }}
            />
          </Paper>
        </LocalizationProvider>
      ) : viewType === 'trend' ? (
        <Paper sx={{ height: 600, width: '100%', p: 2, overflow: 'auto' }}>
          {cities.map(city => {
            const currentDate = dayjs().format('YYYY-MM-DD');
            
            // 获取城市的所有航班记录并排序
            const allCityFlights = flights
              .filter(f => f.city === city)
              .sort((a, b) => b.timestamp - a.timestamp) // 按时间戳降序排序（最新的在前）
              .map(flight => ({
                ...flight,
                date: dayjs(flight.timestamp*1000).format('MM-DD HH:mm'),
                isExpired: flight.depDate < currentDate
              }));
            
            // 只保留最近的100条记录
            const cityFlights = allCityFlights.slice(0, 100)
              .sort((a, b) => a.timestamp - b.timestamp); // 再按时间升序排序用于图表显示
            
            // 检查是否有未过期的航班
            const hasValidFlights = cityFlights.some(flight => !flight.isExpired);
            
            // 跳过没有有效航班的城市
            if (!hasValidFlights) return null;
    
            return (
              <Box key={city} sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  {city} (显示最近100条记录)
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={cityFlights}>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      domain={['dataMin - 100', 'dataMax + 100']}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        padding: '10px'
                      }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const url = !data.isExpired ? generateBookingUrl(data.iataCode, data.depDate, data.retDate) : null;
                          
                          return (
                            <div style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              border: '1px solid #ccc',
                              borderRadius: '4px',
                              padding: '10px'
                            }}>
                              <p style={{ margin: '0 0 5px' }}>{`更新时间: ${data.date}`}</p>
                              <p style={{ 
                                margin: '0 0 5px', 
                                color: data.isExpired ? '#9e9e9e' : '#1976d2' 
                              }}>
                                {url ? (
                                  <a 
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: '#1976d2',
                                      textDecoration: 'none',
                                      '&:hover': { textDecoration: 'underline' }
                                    }}
                                  >
                                    {`价格: ￥${data.price}`}
                                  </a>
                                ) : (
                                  `价格: ￥${data.price}`
                                )}
                              </p>
                              <p style={{ margin: '0 0 5px' }}>{`出发: ${data.depDate}`}</p>
                              <p style={{ margin: '0' }}>{`返程: ${data.retDate}`}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#1976d2"
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const url = !payload.isExpired ? generateBookingUrl(payload.iataCode, payload.depDate, payload.retDate) : null;
                        
                        return (
                          <g style={{ cursor: url ? 'pointer' : 'default' }} onClick={() => url && window.open(url, '_blank')}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={payload.isExpired ? '#9e9e9e' : '#1976d2'}
                              stroke={payload.isExpired ? '#9e9e9e' : '#1976d2'}
                            />
                          </g>
                        );
                      }}
                      activeDot={(props) => {
                        const { cx, cy, payload } = props;
                        const url = !payload.isExpired ? generateBookingUrl(payload.iataCode, payload.depDate, payload.retDate) : null;
                        
                        return (
                          <g style={{ cursor: url ? 'pointer' : 'default' }} onClick={() => url && window.open(url, '_blank')}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={6}
                              fill={payload.isExpired ? '#9e9e9e' : '#1976d2'}
                              stroke={payload.isExpired ? '#9e9e9e' : '#1976d2'}
                            />
                          </g>
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            );
          })}
        </Paper>
      ) : (
        <Paper sx={{ height: 600, width: '100%', overflow: 'hidden', position: 'relative' }}>
    {(loading || !mapReady) && (
      <Box sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000
      }}>
        {loading ? '加载中...' : '地图初始化中...'}
      </Box>
    )}
    
    {mapError && (
      <Box sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'error.main',
        zIndex: 1000
      }}>
        地图加载失败：{mapError}
      </Box>
    )}

    {REACT_APP_AMAP_KEY && !mapError && (
      <Map 
        amapkey={REACT_APP_AMAP_KEY}
        zoom={5}
        center={[114.085947, 22.547]}
        mapStyle="amap://styles/whitesmoke"
        onComplete={() => setMapReady(true)}
        onError={(error) => setMapError(error.message)}
      >
      {mapReady && Object.entries(cityCoordinates).map(([city, coordinates]) => {
        
        return (
          <Marker
        key={city}
        position={coordinates}
        label={{
          content: city,
          direction: 'top'
        }}
        clickable={true}
        onClick={() => {
          const currentDate = dayjs().format('YYYY-MM-DD');
    // 获取未来航班，并按日期组合进行分组
    const futureFlights = flights
      .filter(f => f.city === city && f.depDate >= currentDate)
      .reduce((acc, flight) => {
        const key = `${flight.depDate}-${flight.retDate}`;
        if (!acc[key] || acc[key].timestamp < flight.timestamp) {
          acc[key] = flight;
        }
        return acc;
      }, {});
    
    // 转换为数组并按价格排序
    const uniqueFlights = Object.values(futureFlights)
      .sort((a, b) => a.price - b.price);
    
    if (uniqueFlights.length > 0) {
      setSelectedCityFlights(uniqueFlights);
      setSelectedCityName(city);
      setCityDialogOpen(true);
    }
        }}
      />
        );
      })}
    
    {mapReady && activeRoutes.map((route, index) => {
      const fromCoord = cityCoordinates['深圳'];
      const toCoord = cityCoordinates[route.to];
      if (!fromCoord || !toCoord) return null;
      
      // 计算贝塞尔曲线的控制点
      const dx = toCoord[0] - fromCoord[0];
      const dy = toCoord[1] - fromCoord[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 调整控制点计算方式
      const heightFactor = distance * 0.15; // 降低高度系数
      const midPoint = [
        (fromCoord[0] + toCoord[0]) / 2,
        (fromCoord[1] + toCoord[1]) / 2
      ];
      const controlPoint = [
        midPoint[0], // 控制点 x 坐标保持在中点
        midPoint[1] + heightFactor // 控制点 y 坐标基于中点向上偏移
      ];
  
      // 生成更密集的贝塞尔曲线点以使曲线更平滑
      const points = [];
      for (let t = 0; t <= 1; t += 0.02) { // 减小步长，使曲线更平滑
        const x = Math.pow(1 - t, 2) * fromCoord[0] + 
                  2 * (1 - t) * t * controlPoint[0] + 
                  Math.pow(t, 2) * toCoord[0];
        const y = Math.pow(1 - t, 2) * fromCoord[1] + 
                  2 * (1 - t) * t * controlPoint[1] + 
                  Math.pow(t, 2) * toCoord[1];
        points.push([x, y]);
      }
      
      return (
        <Polyline
          key={index}
          path={points}
          strokeColor="#1976d2"
          strokeWeight={3}
          strokeStyle="solid"
          showDir={true}
          geodesic={false}
          lineJoin="round"
          lineCap="round"
          borderWeight={1}
          isOutline={true}
          outlineColor="rgba(255, 255, 255, 0.6)"
          extData={route}
          events={{
            click: (e) => {
              const routeData = e.target.getExtData();
              alert(`${routeData.from} -> ${routeData.to}\n价格：￥${routeData.price}`);
            }
          }}
        />
      );
    })}
    </Map>
    )}
  </Paper>
      )}

<Dialog open={cityDialogOpen} onClose={() => setCityDialogOpen(false)} maxWidth="md">
  <DialogTitle>{selectedCityName}航班信息</DialogTitle>
  <DialogContent>
    <List>
      {selectedCityFlights.map((flight, index) => {
        const currentDate = dayjs().format('YYYY-MM-DD');
        const url = generateBookingUrl(flight.iataCode, flight.depDate, flight.retDate);
        
        return (
          <ListItem 
            key={index}
            secondaryAction={
              flight.depDate >= currentDate && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#1976d2',
                    textDecoration: 'none',
                    marginLeft: '8px',
                    fontSize: '0.875rem',
                    '&:hover': {
                      textDecoration: 'underline'
                    }
                  }}
                >
                  订票
                </a>
              )
            }
          >
            <ListItemText
              primary={`￥${flight.price}`}
              secondary={`出发：${flight.depDate} 返回：${flight.retDate}`}
            />
          </ListItem>
        );
      })}
    </List>
  </DialogContent>
</Dialog>

<Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>航班信息</DialogTitle>
        <DialogContent>
          <List>
            {dateFlights.map((flight, index) => {
              const currentDate = dayjs().format('YYYY-MM-DD');
              const url = generateBookingUrl(flight.iataCode, flight.depDate, flight.retDate);
              
              return (
                <ListItem key={index}>
                  <ListItemText
                    primary={
                      flight.depDate >= currentDate ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <a 
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#1976d2',
                              textDecoration: 'none',
                              '&:hover': { textDecoration: 'underline' }
                            }}
                          >
                            {flight.city}
                          </a>
                          <span>- ￥{flight.price}</span>
                        </Box>
                      ) : (
                        `${flight.city} - ￥${flight.price}`
                      )
                    }
                    secondary={`出发：${flight.depDate} 返回：${flight.retDate}`}
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default FlightPriceTable;