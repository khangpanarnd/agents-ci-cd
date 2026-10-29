export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
}

export interface UpdateTaskInput {
  title?: string;
  done?: boolean;
}

class TaskRepository {
  private tasks: Task[] = [];
  private nextId = 1;

  all(): Task[] {
    return this.tasks.map((task) => ({ ...task }));
  }

  findById(id: string): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === id);
    return task ? { ...task } : undefined;
  }

  create(input: CreateTaskInput): Task {
    const task: Task = {
      id: String(this.nextId),
      title: input.title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.nextId += 1;
    this.tasks.push(task);
    return { ...task };
  }

  update(id: string, input: UpdateTaskInput): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return undefined;
    }
    if (input.title !== undefined) {
      task.title = input.title;
    }
    if (input.done !== undefined) {
      task.done = input.done;
    }
    return { ...task };
  }

  delete(id: string): boolean {
    const index = this.tasks.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    this.tasks.splice(index, 1);
    return true;
  }

  reset(): void {
    this.tasks = [];
    this.nextId = 1;
  }
}

export const taskRepository = new TaskRepository();
