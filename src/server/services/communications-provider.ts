import type { CommunicationChannel } from '@prisma/client';

export type CommunicationProviderSendInput = {
  channel: CommunicationChannel;
  recipient: string;
  subject: string | null;
  renderedContent: string;
};

export type CommunicationProviderSendResult = {
  success: boolean;
  providerKey: string;
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: Date;
};

export interface CommunicationProvider {
  send(input: CommunicationProviderSendInput): Promise<CommunicationProviderSendResult>;
}

const mockCommunicationProvider: CommunicationProvider = {
  async send(input) {
    const shouldFail =
      input.renderedContent.includes('[[MOCK_FAIL]]') ||
      input.recipient === '0000000000' ||
      input.recipient.endsWith('@fail.local');

    if (shouldFail) {
      return {
        success: false,
        providerKey: 'mock-communications',
        errorMessage: 'Fallo simulado del proveedor mock de comunicaciones.',
      };
    }

    return {
      success: true,
      providerKey: 'mock-communications',
      providerMessageId: `mock-${input.channel.toLowerCase()}-${Date.now()}`,
      sentAt: new Date(),
    };
  },
};

export function resolveCommunicationProvider(_channel: CommunicationChannel): CommunicationProvider {
  return mockCommunicationProvider;
}
