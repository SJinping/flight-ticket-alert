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

// const generateBookingUrl = (iataCode, depDate, retDate) => {
//   return `https://flights.ctrip.com/online/list/round-szx-${iataCode}?_=1&depdate=${depDate}_${retDate}`;
// };

// API URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

const FlightPriceTable = () => {
  const [selectedCityFlights, setSelectedCityFlights] = useState([]);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [selectedCityName, setSelectedCityName] = useState('');
  const [flights, setFlights] = useState([]);
  const [filteredFlights, setFilteredFlights] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDeparture, setSelectedDeparture] = useState('');
  const [departureCities, setDepartureCities] = useState([]);
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
    if (!selectedDeparture) return;
    
    setLoading(true);
    const currentDate = dayjs().format('YYYY-MM-DD');
    const activeFlights = flights.filter(f => f.depDate >= currentDate);

    // 获取当前出发地的城市名
    const departureCity = departureCities.find(c => c.iata_code === selectedDeparture)?.city_name || selectedDeparture;
    const cities = [departureCity, ...new Set(activeFlights.map(f => f.city))];
    await Promise.all(cities.map(city => getCityCoordinate(city)));

    const routes = activeFlights.map(f => ({
      from: departureCity,
      to: f.city,
      price: f.price
    }));

    setActiveRoutes(routes);
    setLoading(false);
  }, [flights, getCityCoordinate, selectedDeparture, departureCities]);

  // 添加 useEffect 来在视图类型改变时获取路线
  useEffect(() => {
    if (viewType === 'map') {
      fetchActiveRoutes();
    }
  }, [viewType, fetchActiveRoutes]);

  // 获取出发地列表
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/departure-cities`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        console.log('Received departure cities:', data);
        setDepartureCities(data);
        // 默认选择深圳，如果找不到深圳则选择第一个出发地
        if (data.length > 0) {
          const shenzhenCity = data.find(city => city.iata_code === 'SZX');
          if (shenzhenCity) {
            setSelectedDeparture('SZX');
          } else {
            setSelectedDeparture(data[0].iata_code);
          }
        }
      })
      .catch(error => {
        console.error('Error fetching departure cities:', error);
      });
  }, []);

  // 从MySQL数据库获取航班数据 - 根据选中的出发地
  useEffect(() => {
    if (!selectedDeparture) return; // 如果没有选择出发地，不查询

    // 设置加载状态
    setLoading(true);

    // 构建API URL，包含出发地参数
    const apiUrl = `${API_BASE_URL}/api/flights?departure=${selectedDeparture}`;
    
    // 从后端API获取数据
    fetch(apiUrl)
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
          return {
            id: index,
            city: flight.city_name || flight.place_to, // 使用城市名称或目的地代码
            depDate: dayjs(flight.dep_date).format('YYYY-MM-DD'),
            retDate: dayjs(flight.arr_date).format('YYYY-MM-DD'),
            price: Number(flight.price),
            timestamp: new Date(flight.last_checked).getTime(), // 直接使用毫秒时间戳
            iataCode: flight.place_to, // 保存IATA代码
            fromCity: flight.from_city_name || flight.place_from // 出发地城市名
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
  }, [selectedDeparture]); // 依赖于selectedDeparture

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

  // 更新generateBookingUrl函数，支持动态出发地
  const generateDynamicBookingUrl = (fromCode, toCode, depDate, retDate) => {
    return `https://flights.ctrip.com/online/list/round-${fromCode.toLowerCase()}-${toCode.toLowerCase()}?_=1&depdate=${depDate}_${retDate}`;
  };

  const columns = [
    { field: 'city', headerName: '目的地', width: 120 },
    { field: 'depDate', headerName: '出发日期', width: 120 },
    { field: 'retDate', headerName: '返程日期', width: 120 },
    { field: 'price', headerName: '价格(￥)', width: 100 },
    { 
      field: 'timestamp', 
      headerName: '更新时间', 
      width: 200,
      valueFormatter: (params) => {
        // 增加错误处理
        if (!params) return '未知';
        const date = dayjs(params);
        if (!date.isValid()) return '无效日期';
        return date.format('YYYY-MM-DD HH:mm:ss');
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
        const url = generateDynamicBookingUrl(selectedDeparture, params.row.iataCode, params.row.depDate, params.row.retDate);
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#1976d2',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline'
              }
            }}
          >
            订票
          </a>
        );
      },
    },
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

  // 获取当前出发地的城市名
  const getCurrentDepartureCityName = () => {
    return departureCities.find(c => c.iata_code === selectedDeparture)?.city_name || selectedDeparture;
  };

  return (
    <Box sx={{ width: '100%', padding: 2 }}>
      <Typography variant="h4" gutterBottom>
        {getCurrentDepartureCityName()}牛马特种兵旅游专线
      </Typography>

      {/* 全局筛选区域 - 对所有视图都有效 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 出发地选择器 */}
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>出发地</InputLabel>
            <Select
              value={selectedDeparture}
              label="出发地"
              onChange={(e) => setSelectedDeparture(e.target.value)}
            >
              {departureCities.map((city) => (
                <MenuItem key={city.iata_code} value={city.iata_code}>
                  {city.city_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 目的地选择器 */}
          <FormControl sx={{ minWidth: 150 }}>
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

          {/* 价格范围 */}
          <TextField
            label="最低价格"
            type="number"
            value={priceRange.min}
            onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
            sx={{ width: 120 }}
          />
          <TextField
            label="最高价格"
            type="number"
            value={priceRange.max}
            onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
            sx={{ width: 120 }}
          />
        </Box>
      </Paper>

      {/* 视图切换标签 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={viewType} 
          onChange={(_event, newValue) => setViewType(newValue)} 
          aria-label="view tabs"
          sx={{ mb: 2 }}
        >
          <Tab value="table" label="表格视图" />
          <Tab value="calendar" label="日历视图" />
          <Tab value="map" label="地图视图" />
          <Tab value="trend" label="价格走势" />
        </Tabs>
      </Box>
      
      {/* 表格视图 */}
      {viewType === 'table' && (
        <Paper sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={filteredFlights}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10]}
            disableSelectionOnClick
            sortModel={[
              {
                field: 'timestamp',
                sort: 'desc'
              },
              {
                field: 'price',
                sort: 'asc'
              }
            ]}
          />
        </Paper>
      )}

      {/* 日历视图 */}
      {viewType === 'calendar' && (
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
      )}

      {/* 价格走势视图 */}
      {viewType === 'trend' && (
        <Paper sx={{ height: 600, width: '100%', p: 2, overflow: 'auto' }}>
          {cities.map(city => {
            const currentDate = dayjs().format('YYYY-MM-DD');
            const cityFlights = filteredFlights
              .filter(f => f.city === city)
              .sort((a, b) => new Date(a.depDate) - new Date(b.depDate))
              .map(f => ({
                ...f,
                isExpired: f.depDate < currentDate
              }));

            if (cityFlights.length === 0) return null;

            return (
              <Box key={city} sx={{ mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {getCurrentDepartureCityName()} → {city}
                </Typography>
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cityFlights}>
                      <XAxis
                        dataKey="depDate"
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        label={{ value: '价格 (￥)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const url = !data.isExpired ? generateDynamicBookingUrl(selectedDeparture, data.iataCode, data.depDate, data.retDate) : null;
                            
                            return (
                              <div style={{
                                backgroundColor: 'white',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                              }}>
                                <p style={{ margin: 0, fontWeight: 'bold' }}>目的地: {data.city}</p>
                                <p style={{ margin: 0 }}>出发: {data.depDate}</p>
                                <p style={{ margin: 0 }}>返回: {data.retDate}</p>
                                <p style={{ margin: 0, color: '#1976d2', fontWeight: 'bold' }}>价格: ¥{data.price}</p>
                                {data.isExpired && (
                                  <p style={{ margin: 0, color: '#f44336', fontSize: '12px' }}>已过期</p>
                                )}
                                {url && (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: '#1976d2',
                                      textDecoration: 'none',
                                      fontSize: '12px',
                                      display: 'block',
                                      marginTop: '5px'
                                    }}
                                  >
                                    点击订票
                                  </a>
                                )}
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
                          const url = !payload.isExpired ? generateDynamicBookingUrl(selectedDeparture, payload.iataCode, payload.depDate, payload.retDate) : null;
                          
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
                          const url = !payload.isExpired ? generateDynamicBookingUrl(selectedDeparture, payload.iataCode, payload.depDate, payload.retDate) : null;
                          
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
              </Box>
            );
          })}
        </Paper>
      )}

      {/* 地图视图 */}
      {viewType === 'map' && (
        <Paper sx={{ p: 2, height: '600px', position: 'relative' }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography>加载地图数据中...</Typography>
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
                // const departureCity = getCurrentDepartureCityName();
                
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
                      const futureFlights = flights
                        .filter(f => f.city === city && f.depDate >= currentDate)
                        .reduce((acc, flight) => {
                          const key = `${flight.depDate}-${flight.retDate}`;
                          if (!acc[key] || acc[key].timestamp < flight.timestamp) {
                            acc[key] = flight;
                          }
                          return acc;
                        }, {});
                      
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
                const departureCity = getCurrentDepartureCityName();
                const fromCoord = cityCoordinates[departureCity];
                const toCoord = cityCoordinates[route.to];
                if (!fromCoord || !toCoord) return null;
                
                const dx = toCoord[0] - fromCoord[0];
                const dy = toCoord[1] - fromCoord[1];
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const heightFactor = distance * 0.15;
                const midPoint = [
                  (fromCoord[0] + toCoord[0]) / 2,
                  (fromCoord[1] + toCoord[1]) / 2
                ];
                const controlPoint = [
                  midPoint[0],
                  midPoint[1] + heightFactor
                ];
            
                const points = [];
                for (let t = 0; t <= 1; t += 0.02) {
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

      {/* 城市航班对话框 */}
      <Dialog open={cityDialogOpen} onClose={() => setCityDialogOpen(false)} maxWidth="md">
        <DialogTitle>{selectedCityName}航班信息</DialogTitle>
        <DialogContent>
          <List>
            {selectedCityFlights.map((flight, index) => {
              const currentDate = dayjs().format('YYYY-MM-DD');
              const url = generateDynamicBookingUrl(selectedDeparture, flight.iataCode, flight.depDate, flight.retDate);
              
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

      {/* 日期航班对话框 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md">
        <DialogTitle>航班信息</DialogTitle>
        <DialogContent>
          <List>
            {dateFlights.map((flight, index) => {
              const currentDate = dayjs().format('YYYY-MM-DD');
              const url = generateDynamicBookingUrl(selectedDeparture, flight.iataCode, flight.depDate, flight.retDate);
              
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