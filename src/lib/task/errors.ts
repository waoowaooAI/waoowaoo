export class TaskTerminatedError extends Error {
  taskId: string

  constructor(taskId: string, message = 'Task terminated') {
    super(message)
    this.name = 'TaskTerminatedError'
    this.taskId = taskId
  }
}
