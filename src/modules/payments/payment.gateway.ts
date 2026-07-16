export type PaymentCheckoutReceipt<TProviderResponse = unknown> = {
  gateway: string;
  externalPaymentId: string;
  checkoutUrl: string;
  raw: TProviderResponse;
};

export interface PaymentGateway<TCheckoutInput, TProviderResponse = unknown> {
  readonly name: string;

  createCheckout(
    input: TCheckoutInput,
  ): Promise<PaymentCheckoutReceipt<TProviderResponse>>;
  verifyWebhook(payload: unknown, signature: string | undefined): boolean;
}
