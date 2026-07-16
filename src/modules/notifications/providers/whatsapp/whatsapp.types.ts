export type WhatsAppTextParameter = {
  type: 'text';
  text: string;
};

export type WhatsAppCurrencyParameter = {
  type: 'currency';
  currency: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
};

export type WhatsAppDateTimeParameter = {
  type: 'date_time';
  date_time: {
    fallback_value: string;
  };
};

export type WhatsAppTemplateParameter =
  | WhatsAppTextParameter
  | WhatsAppCurrencyParameter
  | WhatsAppDateTimeParameter;

export type WhatsAppTemplateComponent =
  | {
      type: 'header' | 'body';
      parameters: WhatsAppTemplateParameter[];
    }
  | {
      type: 'button';
      sub_type: 'url' | 'quick_reply';
      index: string;
      parameters: WhatsAppTemplateParameter[];
    };

export type SendWhatsAppTemplateInput = {
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
};

export type SendWhatsAppOtpInput = {
  to: string;
  code: string;
  templateName: string;
  languageCode: string;
};

export type WhatsAppSendResponse = {
  messaging_product: 'whatsapp';
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
    message_status?: string;
  }>;
};

export type WhatsAppMessageStatus = {
  messageId: string;
  status: string;
  recipientId?: string;
  timestamp?: string;
  errors?: unknown[];
};
