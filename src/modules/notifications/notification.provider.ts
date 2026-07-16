export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';

export type NotificationDeliveryReceipt<TProviderResponse = unknown> = {
  channel: NotificationChannel;
  provider: string;
  externalMessageId: string;
  acceptedAt: Date;
  raw: TProviderResponse;
};

export interface NotificationProvider<TMessage> {
  readonly channel: NotificationChannel;
  readonly provider: string;

  send(message: TMessage): Promise<NotificationDeliveryReceipt>;
}
