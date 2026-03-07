export class StorageProviderNotImplementedError extends Error {
  constructor(type: string) {
    super(`Storage provider "${type}" is not implemented`)
    this.name = 'StorageProviderNotImplementedError'
  }
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageConfigError'
  }
}
