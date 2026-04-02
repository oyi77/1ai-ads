import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import adsRouter from './server/routes/ads.js';
import landingRouter from './server/routes/landing.js';
import analyticsRouter from './server/routes/analytics.js';
import mcpRouter from './server/routes/mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/ads', adsRouter);
app.use('/api/landing', landingRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/mcp', mcpRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
}

app.listen(PORT, () => console.log(`AdForge running on ${PORT}`));

export default app;
