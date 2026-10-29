import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app';
import { taskRepository } from '../src/models/task.model';

describe('Tasks API', () => {
  beforeEach(() => {
    taskRepository.reset();
  });

  describe('POST /api/tasks', () => {
    it('creates a task and returns 201', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Write demo' });
      expect(res.status).toBe(201);
      expect(res.body.task.title).toBe('Write demo');
      expect(res.body.task.done).toBe(false);
    });

    it('rejects an empty title with 400', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects a missing title with 400', async () => {
      const res = await request(app).post('/api/tasks').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/tasks', () => {
    it('returns all tasks', async () => {
      taskRepository.create({ title: 'First' });
      taskRepository.create({ title: 'Second' });
      const res = await request(app).get('/api/tasks');
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns a task by id', async () => {
      const created = taskRepository.create({ title: 'Find me' });
      const res = await request(app).get(`/api/tasks/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.task.id).toBe(created.id);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/api/tasks/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('updates title and done', async () => {
      const created = taskRepository.create({ title: 'Before' });
      const res = await request(app)
        .put(`/api/tasks/${created.id}`)
        .send({ title: 'After', done: true });
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('After');
      expect(res.body.task.done).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).put('/api/tasks/999').send({ title: 'x' });
      expect(res.status).toBe(404);
    });

    it('rejects a non-boolean done with 400', async () => {
      const created = taskRepository.create({ title: 'Keep' });
      const res = await request(app)
        .put(`/api/tasks/${created.id}`)
        .send({ done: 'banana' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects a null title with 400', async () => {
      const created = taskRepository.create({ title: 'Keep' });
      const res = await request(app)
        .put(`/api/tasks/${created.id}`)
        .send({ title: null });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task and returns 204', async () => {
      const created = taskRepository.create({ title: 'Bye' });
      const res = await request(app).delete(`/api/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(taskRepository.all()).toHaveLength(0);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).delete('/api/tasks/999');
      expect(res.status).toBe(404);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 with an error body', async () => {
      const res = await request(app).get('/api/nope');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });
});
