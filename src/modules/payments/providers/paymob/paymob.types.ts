export type PaymobPaymentMethod = number | string;

export type PaymobBillingData = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  country?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
};

export type PaymobCustomer = {
  first_name?: string;
  last_name?: string;
  email?: string;
  extras?: Record<string, unknown>;
};

export type PaymobIntentionItem = {
  name: string;
  amount: number;
  description?: string;
  quantity?: number;
  image?: string;
};

export type CreatePaymobIntentionInput = {
  amount: number;
  currency: string;
  payment_methods: PaymobPaymentMethod[];
  items: PaymobIntentionItem[];
  billing_data: PaymobBillingData;
  customer?: PaymobCustomer;
  extras?: Record<string, unknown>;
  special_reference?: string;
  expiration?: number;
  notification_url?: string;
  redirection_url?: string;
};

export type PaymobIntentionResponse = {
  id: string;
  client_secret: string;
  intention_order_id?: number;
  amount?: number;
  currency?: string;
  status?: string;
  created?: string;
  [key: string]: unknown;
};

export type PaymobCheckout = PaymentCheckoutReceipt<PaymobIntentionResponse> & {
  intention: PaymobIntentionResponse;
};

export type PaymobTransactionSummary = {
  id?: string;
  orderId?: string;
  amountMinor?: number;
  currency?: string;
  success?: boolean;
  pending?: boolean;
  integrationId?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
};
import type { PaymentCheckoutReceipt } from '../../payment.gateway';
