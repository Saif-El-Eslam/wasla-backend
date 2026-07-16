export class PaymobConfigurationError extends Error {
  constructor(public readonly missingKeys: string[]) {
    super(
      'Paymob is enabled but is missing required configuration: ' +
        missingKeys.join(', '),
    );
    this.name = 'PaymobConfigurationError';
  }
}

export class PaymobRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'PaymobRequestError';
  }
}
