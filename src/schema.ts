export type IncomingMessage = {
    messageId: string;
    channelId: string;
    raw: string;
    message: string;
    threadId?: string;
}

export type OutgoingMessage = {
    channelId: string;
    data: string | Buffer;
    dataType: 'text' | 'image' | 'file';
    threadId?: string;
}

export type Reactions = {
    loading?: string;
    success?: string;
    failed?: string;
}

export type CommandHook = {
    isSync: boolean;
    dataType: 'text'|'image' | 'file';
    handler: (message: IncomingMessage) => Promise<string|Buffer>;
}
