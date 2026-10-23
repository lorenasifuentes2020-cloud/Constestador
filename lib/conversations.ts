export type ConversationStatus = 'open' | 'waiting' | 'closed';
export type ConversationMode = 'ai' | 'human';
export type ConversationChannel = 'Manual' | 'Web' | 'WhatsApp' | 'Instagram' | 'Messenger';

export type ConversationSummary = {
  id: string;
  storeId: string;
  storeName: string;
  channel: ConversationChannel;
  customerName: string;
  status: ConversationStatus;
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
