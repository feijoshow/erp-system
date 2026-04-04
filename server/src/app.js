import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import customersRouter from './modules/customers/customers.routes.js';
import dashboardRouter from './modules/dashboard/dashboard.routes.js';
import invoicesRouter from './modules/invoices/invoices.routes.js';
import ordersRouter from './modules/orders/orders.routes.js';
import productsRouter from './modules/products/products.routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      const isLocalDevOrigin =
        env.nodeEnv === 'development' &&
        typeof origin === 'string' &&
        /^https?:\/\/localhost:\d+$/.test(origin);

      if (!origin || env.clientOrigins.includes(origin) || isLocalDevOrigin) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, uptime: process.uptime() });
});

app.use('/api', requireAuth);

app.get('/api/me', (request, response) => {
  response.json({
    data: {
      user: {
        id: request.user.id,
        email: request.user.email,
      },
      profile: request.profile,
    },
  });
});

app.use('/api/products', productsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/dashboard', dashboardRouter);

app.use(notFoundHandler);
app.use(errorHandler);
