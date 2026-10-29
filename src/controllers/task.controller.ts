import type { Request, Response } from 'express';
import type { CreateTaskInput, UpdateTaskInput } from '../models/task.model';
import { taskRepository } from '../models/task.model';

export function listTasks(_req: Request, res: Response): void {
  res.status(200).json({ tasks: taskRepository.all() });
}

export function getTask(req: Request, res: Response): void {
  const task = taskRepository.findById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ task });
}

export function createTask(req: Request, res: Response): void {
  const { title } = (req.body ?? {}) as CreateTaskInput;
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }
  const created = taskRepository.create({ title });
  res.status(201).json({ task: created });
}

export function updateTask(req: Request, res: Response): void {
  const input = (req.body ?? {}) as UpdateTaskInput;
  if (input.title !== undefined && (typeof input.title !== 'string' || input.title.trim().length === 0)) {
    res.status(400).json({ error: 'title must be a non-empty string' });
    return;
  }
  if (input.done !== undefined && typeof input.done !== 'boolean') {
    res.status(400).json({ error: 'done must be a boolean' });
    return;
  }
  const updated = taskRepository.update(req.params.id, input);
  if (!updated) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ task: updated });
}

export function deleteTask(req: Request, res: Response): void {
  const deleted = taskRepository.delete(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
}
