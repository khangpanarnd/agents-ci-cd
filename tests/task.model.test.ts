import { describe, it, expect, beforeEach } from 'vitest';
import { taskRepository } from '../src/models/task.model';

describe('taskRepository', () => {
  beforeEach(() => {
    taskRepository.reset();
  });

  it('creates tasks with sequential string ids and done=false', () => {
    const first = taskRepository.create({ title: 'First' });
    const second = taskRepository.create({ title: 'Second' });

    expect(first.id).toBe('1');
    expect(first.title).toBe('First');
    expect(first.done).toBe(false);
    expect(second.id).toBe('2');
  });

  it('returns copies — mutating results does not corrupt the store', () => {
    const created = taskRepository.create({ title: 'Original' });
    created.title = 'Mutated';
    expect(taskRepository.findById(created.id)?.title).toBe('Original');
  });

  it('findById returns undefined for unknown id', () => {
    expect(taskRepository.findById('999')).toBeUndefined();
  });

  it('update mutates only the provided fields', () => {
    const created = taskRepository.create({ title: 'Before' });
    const updated = taskRepository.update(created.id, { done: true });

    expect(updated?.title).toBe('Before');
    expect(updated?.done).toBe(true);

    const renamed = taskRepository.update(created.id, { title: 'After' });
    expect(renamed?.title).toBe('After');
    expect(renamed?.done).toBe(true);
  });

  it('update returns undefined for unknown id', () => {
    expect(taskRepository.update('999', { done: true })).toBeUndefined();
  });

  it('delete removes a task and reports true; unknown id reports false', () => {
    const created = taskRepository.create({ title: 'Bye' });
    expect(taskRepository.delete(created.id)).toBe(true);
    expect(taskRepository.all()).toHaveLength(0);
    expect(taskRepository.delete('999')).toBe(false);
  });
});
