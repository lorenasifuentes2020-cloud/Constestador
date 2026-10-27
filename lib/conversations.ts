export type ConversationStatus = 'open' | 'waiting' | 'closed';
export type ConversationMode = 'ai' | 'human';
export type ConversationChannel = 'Manual' | 'Web' | 'WhatsApp' | 'Instagram' | 'Messenger';
export const CONVERSATION_SALES_STAGES = ['inquiry', 'interested', 'ready', 'order_created', 'won', 'lost'] as const;
export type ConversationSalesStage = typeof CONVERSATION_SALES_STAGES[number];
export const CONVERSATION_SALES_STAGE_LABELS: Record<ConversationSalesStage, string> = {
  inquiry: 'Consulta',
  interested: 'Interesado',
  ready: 'Listo para comprar',
  order_created: 'Pedido creado',
  won: 'Venta cerrada',
  lost: 'No concretado',
};

export type ConversationSummary = {
  id: string;
  storeId: string;
  storeName: string;
  channel: ConversationChannel;
  customerName: string;
  status: ConversationStatus;
  salesStage: ConversationSalesStage;
  mode: ConversationMode;
  assignedUserId: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  sender: 'customer' | 'assistant' | 'team' | 'system';
  body: string;
  createdAt: string;
};

export type ConversationAdvisor = {
  userId: string;
  email: string;
  role: 'owner' | 'admin';
};
