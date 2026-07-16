export class WhatsAppConfigurationError extends Error {
  constructor(public readonly missingKeys: string[]) {
    super(
      'WhatsApp is enabled but is missing required configuration: ' +
        missingKeys.join(', '),
    );
    this.name = 'WhatsAppConfigurationError';
  }
}

export class WhatsAppRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'WhatsAppRequestError';
  }
}
