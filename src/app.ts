import express from 'express';
import taskRoutes from './routes/task.routes';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', taskRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
