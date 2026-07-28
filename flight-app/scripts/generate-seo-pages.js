const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.weekfly.fun';
const DEPARTURE_CODE = 'SZX';
const DEPARTURE_CITY = '深圳';
const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const sourceIndexPath = path.join(buildDir, 'index.html');
const priceLogPath = path.join(projectRoot, 'public', 'price_log.txt');

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const formatDate = (value) => {
  const text = String(value || '');
  if (!/^\d{8}$/.test(text)) return text;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
};

const parseHistoricalFlights = () => {
  if (!fs.existsSync(priceLogPath)) return [];

  return fs
    .readFileSync(priceLogPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [city, depDate, retDate, price, timestamp, code] = line.split(',');
      return {
        city,
        code: String(code || '').toUpperCase(),
        depDate: formatDate(depDate),
        retDate: formatDate(retDate),
        price: Number(price),
        timestamp: Number(timestamp),
        source: 'historical',
      };
    })
    .filter((flight) => flight.city && /^[A-Z]{3}$/.test(flight.code) && Number.isFinite(flight.price));
};

const fetchCurrentFlights = async () => {
  const apiBaseUrl = process.env.REACT_APP_API_BASE_URL;
  if (!apiBaseUrl || !/^https?:\/\//.test(apiBaseUrl)) return [];

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/api/flights?departure=${DEPARTURE_CODE}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return [];

    const data = await response.json();
    return data
      .map((flight) => ({
        city: flight.city_name || flight.place_to,
        code: String(flight.place_to || '').toUpperCase(),
        depDate: String(flight.dep_date || '').slice(0, 10),
        retDate: String(flight.arr_date || '').slice(0, 10),
        price: Number(flight.price),
        timestamp: new Date(flight.last_checked).getTime(),
        source: 'current',
      }))
      .filter((flight) => flight.city && /^[A-Z]{3}$/.test(flight.code) && Number.isFinite(flight.price));
  } catch (error) {
    console.warn(`SEO pages: current API unavailable, using historical data (${error.message})`);
    return [];
  }
};

const groupRoutes = (flights) => {
  const routes = new Map();

  flights.forEach((flight) => {
    if (!routes.has(flight.code)) {
      routes.set(flight.code, {
        city: flight.city,
        code: flight.code,
        flights: [],
      });
    }
    routes.get(flight.code).flights.push(flight);
  });

  return [...routes.values()].sort((a, b) => a.city.localeCompare(b.city, 'zh-CN'));
};

const replaceMeta = (html, { title, description, canonical, fallback, structuredData }) => {
  let output = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(description)}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeHtml(title)}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeHtml(description)}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${canonical}" />`
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${canonical}" />`
    )
    .replace(
      /<div id="root">[\s\S]*?<\/div>/,
      `<div id="root">${fallback}</div>`
    );

  if (structuredData) {
    output = output.replace(
      '</head>',
      `<script type="application/ld+json">${JSON.stringify(structuredData)}</script></head>`
    );
  }

  return output;
};

const createRouteFallback = (route) => {
  const prices = route.flights.map((flight) => flight.price);
  const lowestPrice = Math.min(...prices);
  const dates = route.flights.map((flight) => flight.depDate).filter(Boolean).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const currentFlights = route.flights.filter((flight) => flight.source === 'current');
  const currentLowest = currentFlights.length
    ? Math.min(...currentFlights.map((flight) => flight.price))
    : null;
  const priceText = currentLowest
    ? `构建时查询到的未来周末往返最低价为 ¥${currentLowest}，打开页面可查看具体日期与最新价格。`
    : `历史数据中记录的周末往返最低价为 ¥${lowestPrice}，样本日期范围为 ${firstDate} 至 ${lastDate}；打开页面后会加载数据库中的最新价格。`;

  return `
    <main class="seo-fallback" style="max-width:960px;margin:48px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937">
      <nav><a href="/">WeekFly 周末飞</a> / ${escapeHtml(route.city)}</nav>
      <h1>${DEPARTURE_CITY}到${escapeHtml(route.city)}周末往返机票价格走势</h1>
      <p>查询从${DEPARTURE_CITY}（${DEPARTURE_CODE}）飞往${escapeHtml(route.city)}（${escapeHtml(route.code)}）的周末往返机票、低价日期和历史价格走势。</p>
      <h2>价格摘要</h2>
      <p>${priceText}</p>
      <p>WeekFly 聚焦周五或周六出发、周日或周一返回的轻量查询场景。价格会随航司库存变化，请以订票平台最终显示为准。</p>
      <p><a href="/">查看全部深圳周末低价航线</a></p>
      <p>正在加载最新机票数据……</p>
    </main>`;
};

const createHomeFallback = (routes) => {
  const routeLinks = routes
    .map(
      (route) =>
        `<li><a href="/flights/${DEPARTURE_CODE.toLowerCase()}-${route.code.toLowerCase()}/">${DEPARTURE_CITY}到${escapeHtml(route.city)}周末机票</a></li>`
    )
    .join('');

  return `
    <main class="seo-fallback" style="max-width:960px;margin:48px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937">
      <h1>WeekFly 周末飞</h1>
      <p>快速查看从深圳出发的周末往返机票、低价目的地和历史价格走势。无需复杂搜索，打开页面即可按目的地、预算和日期筛选。</p>
      <h2>深圳出发的周末航线</h2>
      <ul>${routeLinks}</ul>
      <p>正在加载最新机票数据……</p>
    </main>`;
};

const writeSitemap = (routes) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = [
    `${SITE_URL}/`,
    ...routes.map(
      (route) =>
        `${SITE_URL}/flights/${DEPARTURE_CODE.toLowerCase()}-${route.code.toLowerCase()}/`
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url, index) => `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${index === 0 ? 'daily' : 'weekly'}</changefreq>
    <priority>${index === 0 ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(buildDir, 'sitemap.xml'), xml);
};

const main = async () => {
  if (!fs.existsSync(sourceIndexPath)) {
    throw new Error('build/index.html not found. Run react-scripts build first.');
  }

  const historicalFlights = parseHistoricalFlights();
  const currentFlights = await fetchCurrentFlights();
  const routes = groupRoutes([...historicalFlights, ...currentFlights]);
  const baseHtml = fs.readFileSync(sourceIndexPath, 'utf8');
  const homeTitle = 'WeekFly 周末飞｜深圳出发的周末低价机票';
  const homeDescription =
    'WeekFly 周末飞：快速查看从深圳出发的周末往返机票、低价目的地和历史价格走势，轻量查询后可直接前往订票。';
  const homeHtml = replaceMeta(baseHtml, {
    title: homeTitle,
    description: homeDescription,
    canonical: `${SITE_URL}/`,
    fallback: createHomeFallback(routes),
  });
  fs.writeFileSync(sourceIndexPath, homeHtml);

  routes.forEach((route) => {
    const slug = `${DEPARTURE_CODE.toLowerCase()}-${route.code.toLowerCase()}`;
    const canonical = `${SITE_URL}/flights/${slug}/`;
    const title = `${DEPARTURE_CITY}到${route.city}周末机票价格走势｜WeekFly`;
    const description = `查询${DEPARTURE_CITY}到${route.city}的周末往返机票、低价日期和历史价格走势，打开 WeekFly 快速比较并前往订票。`;
    const routeHtml = replaceMeta(baseHtml, {
      title,
      description,
      canonical,
      fallback: createRouteFallback(route),
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        url: canonical,
        description,
        isPartOf: {
          '@type': 'WebSite',
          name: 'WeekFly 周末飞',
          url: `${SITE_URL}/`,
        },
      },
    });
    const routeDir = path.join(buildDir, 'flights', slug);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml);
  });

  writeSitemap(routes);
  console.log(`SEO pages generated: homepage + ${routes.length} routes`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
