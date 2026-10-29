import { Router } from 'express';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from '../controllers/task.controller';

export const taskRoutes = Router();

taskRoutes.get('/', listTasks);
taskRoutes.get('/:id', getTask);
taskRoutes.post('/', createTask);
taskRoutes.put('/:id', updateTask);
taskRoutes.delete('/:id', deleteTask);

export default taskRoutes;
