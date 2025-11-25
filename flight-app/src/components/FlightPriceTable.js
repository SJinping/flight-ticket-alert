import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Paper, 
  TextField, 
  Typography,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemText,
  Card,
  Button,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  InputAdornment
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
// import { Amap, Polyline, Marker } from '@amap/amap-react';
import { Map, Marker, Polyline } from '@uiw/react-amap';
import dayjs from 'dayjs';
// 在文件顶部添加 recharts 相关导入
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Icons
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import FlightLandIcon from '@mui/icons-material/FlightLand';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TableChartIcon from '@mui/icons-material/TableChart';
import MapIcon from '@mui/icons-material/Map';
import TimelineIcon from '@mui/icons-material/Timeline';
// import SearchIcon from '@mui/icons-material/Search';

// 在组件顶部添加安全配置
window._AMapSecurityConfig = {
  securityJsCode: process.env.REACT_APP_AMAP_SECURITY_CODE
};

// API URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

// Custom Theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Airline Blue
    },
    secondary: {
      main: '#ff9800', // Accent Orange
    },
    background: {
      default: '#f5f7fa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 12,
        },
        elevation1: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
});

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
  const accentColor = theme.palette.secondary.main;

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

        const currentDate = dayjs().format('YYYY-MM-DD');

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

        // 过滤掉出发日期已过期的航班
        const validFlights = processedFlights.filter(f => f.depDate >= currentDate);

        setFlights(validFlights);
        setFilteredFlights(validFlights);

        // 只显示有可预订航班的城市
        const uniqueCities = [...new Set(validFlights.map(f => f.city))];
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
    const currentDate = dayjs().format('YYYY-MM-DD');
    
    // 首先过滤掉过期航班
    let filtered = flights.filter(f => f.depDate >= currentDate);
    
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 4 }}>
        {/* Hero Section */}
        <Box 
          sx={{ 
            py: 6, 
            mb: 4, 
            textAlign: 'center', 
            background: 'linear-gradient(135deg, #1976d2 0%, #64b5f6 100%)', 
            color: 'white',
            boxShadow: '0 4px 20px rgba(25, 118, 210, 0.25)'
          }}
        >
          <Container maxWidth="lg">
            <Typography variant="h3" component="h1" fontWeight="800" gutterBottom>
              ✈️ {getCurrentDepartureCityName()} 牛马特种兵旅游专线
            </Typography>
            <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400 }}>
              发现最划算的周末往返机票，说走就走
            </Typography>
          </Container>
        </Box>

        <Container maxWidth="lg">
          {/* Search/Filter Bar */}
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              mb: 4, 
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'flex', 
              gap: 2, 
              flexWrap: 'wrap', 
              alignItems: 'center',
              background: '#fff'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 200 }}>
              <FlightTakeoffIcon color="primary" />
              <FormControl variant="outlined" size="small" fullWidth>
                <Select
                  value={selectedDeparture}
                  onChange={(e) => setSelectedDeparture(e.target.value)}
                  displayEmpty
                  startAdornment={<Typography variant="caption" sx={{ mr: 1, color: 'text.secondary' }}>出发:</Typography>}
                >
                  {departureCities.map((city) => (
                    <MenuItem key={city.iata_code} value={city.iata_code}>
                      {city.city_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 200 }}>
              <FlightLandIcon color="primary" />
              <FormControl variant="outlined" size="small" fullWidth>
                <Select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  displayEmpty
                  startAdornment={<Typography variant="caption" sx={{ mr: 1, color: 'text.secondary' }}>到达:</Typography>}
                >
                  <MenuItem value="">全部城市</MenuItem>
                  {cities.map(city => (
                    <MenuItem key={city} value={city}>{city}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, minWidth: 250 }}>
              <AttachMoneyIcon color="primary" />
              <TextField
                placeholder="最低价"
                type="number"
                size="small"
                value={priceRange.min}
                onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }}
                sx={{ width: 100 }}
              />
              <Typography variant="body2" color="text.secondary">-</Typography>
              <TextField
                placeholder="最高价"
                type="number"
                size="small"
                value={priceRange.max}
                onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }}
                sx={{ width: 100 }}
              />
            </Box>
          </Paper>

          {/* View Tabs */}
          <Card elevation={0} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={viewType} 
              onChange={(_event, newValue) => setViewType(newValue)} 
              aria-label="view tabs"
              variant="scrollable"
              scrollButtons="auto"
              sx={{ px: 2, bgcolor: 'background.paper' }}
              TabIndicatorProps={{
                sx: {
                  backgroundColor: accentColor,
                  height: 3,
                  borderRadius: 3
                }
              }}
            >
              <Tab 
                icon={<TableChartIcon />} 
                iconPosition="start" 
                value="table" 
                label="表格视图"
                sx={{ color: viewType === 'table' ? 'primary.main' : 'text.secondary' }}
              />
              <Tab 
                icon={<CalendarMonthIcon />} 
                iconPosition="start" 
                value="calendar" 
                label="日历视图"
                sx={{ color: viewType === 'calendar' ? 'primary.main' : 'text.secondary' }}
              />
              <Tab 
                icon={<MapIcon />} 
                iconPosition="start" 
                value="map" 
                label="地图视图"
                sx={{ color: viewType === 'map' ? 'primary.main' : 'text.secondary' }}
              />
              <Tab 
                icon={<TimelineIcon />} 
                iconPosition="start" 
                value="trend" 
                label="价格走势"
                sx={{ color: viewType === 'trend' ? 'primary.main' : 'text.secondary' }}
              />
            </Tabs>
          </Card>
          
          {/* Views Content */}
          <Paper elevation={0} sx={{ overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
            {/* 表格视图 */}
            {viewType === 'table' && (
              <Box sx={{ height: 600, width: '100%' }}>
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
                  sx={{
                    border: 'none',
                    '& .MuiDataGrid-cell:focus': {
                      outline: 'none',
                    },
                    '& .MuiDataGrid-columnHeaders': {
                      bgcolor: '#f5f7fa',
                      fontWeight: 600,
                    },
                  }}
                />
              </Box>
            )}

            {/* 日历视图 */}
            {viewType === 'calendar' && (
              <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <Paper 
                    elevation={0}
                    sx={{ 
                      border: '1px solid rgba(0,0,0,0.12)',
                      borderRadius: 4,
                      p: 2
                    }}
                  >
                    <DateCalendar 
                      onChange={handleDateClick}
                      shouldDisableDate={(date) => !hasFlights(date)}
                      sx={{
                        width: 320,
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
                          // backgroundColor: '#f5f5f5',
                          // borderRadius: 1,
                          marginBottom: 1,
                          padding: 1
                        }
                      }}
                    />
                  </Paper>
                </LocalizationProvider>
              </Box>
            )}

            {/* 价格走势视图 */}
            {viewType === 'trend' && (
              <Box sx={{ height: 600, width: '100%', p: 3, overflow: 'auto' }}>
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
                    <Box key={city} sx={{ mb: 6 }}>
                      <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FlightTakeoffIcon fontSize="small" color="action" />
                        {getCurrentDepartureCityName()} 
                        <Typography component="span" color="text.secondary" sx={{ mx: 1 }}>→</Typography>
                        <FlightLandIcon fontSize="small" color="action" />
                        {city}
                      </Typography>
                      <Box sx={{ height: 300, border: '1px solid #eee', borderRadius: 2, p: 2, bgcolor: '#fff' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={cityFlights}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                            <XAxis
                              dataKey="depDate"
                              tick={{ fontSize: 12, fill: '#666' }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                              tickMargin={20}
                            />
                            <YAxis
                              tick={{ fontSize: 12, fill: '#666' }}
                              label={{ value: '价格 (￥)', angle: -90, position: 'insideLeft', fill: '#666' }}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const url = !data.isExpired ? generateDynamicBookingUrl(selectedDeparture, data.iataCode, data.depDate, data.retDate) : null;
                                  
                                  return (
                                    <Paper elevation={3} sx={{ p: 2, bgcolor: 'rgba(255, 255, 255, 0.95)' }}>
                                      <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{data.city}</Typography>
                                      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, fontSize: '0.875rem' }}>
                                        <Typography color="text.secondary">出发:</Typography>
                                        <Typography>{data.depDate}</Typography>
                                        <Typography color="text.secondary">返回:</Typography>
                                        <Typography>{data.retDate}</Typography>
                                        <Typography color="text.secondary">价格:</Typography>
                                        <Typography color="secondary.main" fontWeight="bold">¥{data.price}</Typography>
                                      </Box>
                                      {data.isExpired && (
                                        <Typography color="error" variant="caption" display="block" sx={{ mt: 1 }}>已过期</Typography>
                                      )}
                                      {url && (
                                        <Button 
                                          size="small" 
                                          variant="contained" 
                                          color="secondary"
                                          fullWidth 
                                          sx={{ mt: 1.5 }}
                                          onClick={() => window.open(url, '_blank')}
                                        >
                                          点击订票
                                        </Button>
                                      )}
                                    </Paper>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke={accentColor}
                              strokeWidth={2}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                const url = !payload.isExpired ? generateDynamicBookingUrl(selectedDeparture, payload.iataCode, payload.depDate, payload.retDate) : null;
                                
                                return (
                                  <g style={{ cursor: url ? 'pointer' : 'default' }} onClick={() => url && window.open(url, '_blank')}>
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={4}
                                      fill={payload.isExpired ? '#bdbdbd' : accentColor}
                                      stroke="white"
                                      strokeWidth={2}
                                    />
                                  </g>
                                );
                              }}
                              activeDot={{ r: 6, strokeWidth: 0, fill: accentColor }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}

            {/* 地图视图 */}
            {viewType === 'map' && (
              <Box sx={{ p: 0, height: '600px', position: 'relative' }}>
                {loading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', bgcolor: '#f5f5f5' }}>
                    <Typography color="text.secondary">加载地图数据中...</Typography>
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
                          strokeColor={accentColor}
                          strokeWeight={4}
                          strokeStyle="solid"
                          showDir={true}
                          geodesic={false}
                          lineJoin="round"
                          lineCap="round"
                          borderWeight={2}
                          isOutline={true}
                          outlineColor="#ffffff"
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
              </Box>
            )}
          </Paper>
        </Container>

        {/* 城市航班对话框 */}
        <Dialog 
          open={cityDialogOpen} 
          onClose={() => setCityDialogOpen(false)} 
          maxWidth="sm" 
          fullWidth
          PaperProps={{
            elevation: 24,
            shape: { borderRadius: 16 }
          }}
        >
          <DialogTitle sx={{ borderBottom: '1px solid #eee', pb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <FlightLandIcon color="primary" />
              <Typography variant="h6">{selectedCityName} 航班信息</Typography>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <List>
              {selectedCityFlights.map((flight, index) => {
                const currentDate = dayjs().format('YYYY-MM-DD');
                const url = generateDynamicBookingUrl(selectedDeparture, flight.iataCode, flight.depDate, flight.retDate);
                
                return (
                  <ListItem 
                    key={index}
                    sx={{ 
                      borderBottom: '1px solid #f5f5f5',
                      py: 2
                    }}
                    secondaryAction={
                      flight.depDate >= currentDate && (
                      <Button
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="contained"
                        color="secondary"
                          size="small"
                          disableElevation
                        >
                          订票
                        </Button>
                      )
                    }
                  >
                    <ListItemText
                      primary={
                        <Typography variant="h6" color="primary.main" fontWeight="bold">
                          ￥{flight.price}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="body2" color="text.primary">
                            出发：{flight.depDate}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            返回：{flight.retDate}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </DialogContent>
        </Dialog>

        {/* 日期航班对话框 */}
        <Dialog 
          open={dialogOpen} 
          onClose={() => setDialogOpen(false)} 
          maxWidth="sm" 
          fullWidth
          PaperProps={{
            elevation: 24,
            shape: { borderRadius: 16 }
          }}
        >
          <DialogTitle sx={{ borderBottom: '1px solid #eee', pb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <CalendarMonthIcon color="primary" />
              <Typography variant="h6">当日航班信息</Typography>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <List>
              {dateFlights.map((flight, index) => {
                const currentDate = dayjs().format('YYYY-MM-DD');
                const url = generateDynamicBookingUrl(selectedDeparture, flight.iataCode, flight.depDate, flight.retDate);
                
                return (
                  <ListItem 
                    key={index} 
                    sx={{ 
                      borderBottom: '1px solid #f5f5f5',
                      py: 1.5
                    }}
                  >
                    <ListItemText
                      primary={
                        flight.depDate >= currentDate ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle1" fontWeight="500">{flight.city}</Typography>
                            </Box>
                            <Typography color="primary.main" fontWeight="bold">￥{flight.price}</Typography>
                          </Box>
                        ) : (
                          `${flight.city} - ￥${flight.price}`
                        )
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">出发: {flight.depDate}</Typography>
                          <Typography variant="caption" color="text.secondary">返回: {flight.retDate}</Typography>
                        </Box>
                      }
                    />
                    {flight.depDate >= currentDate && (
                      <Button
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="small"
                        variant="contained"
                        color="secondary"
                      >
                        订票
                      </Button>
                    )}
                  </ListItem>
                );
              })}
            </List>
          </DialogContent>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
};

export default FlightPriceTable;