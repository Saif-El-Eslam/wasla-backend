export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly messageKey: string,
    public readonly details?: unknown,
    public readonly interpolation?: Record<string, string | number>,
  ) {
    super(messageKey);
    this.name = 'HttpError';
  }
}
