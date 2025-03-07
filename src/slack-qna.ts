import { App, GenericMessageEvent } from "@slack/bolt";
import { CommandHook, IncomingMessage, OutgoingMessage, Reactions } from "./schema";
import { getFileTypeFromBuffer } from "./utils/fileUtils";

export interface SlackQnaListenArgs {
    command?: boolean,
    mention?: boolean,
    directMessage?: boolean,
}

export interface SlackQnaArgs {
    slackBotToken: string;
    slackAppToken: string;
    botUserId: string;
    reactions?: Reactions;
}
export class SlackQna {

    private slackApp: App;
    private reactions: Reactions;
    private commandHook?: CommandHook;
    private botUserId: string;

    constructor(args: SlackQnaArgs) {

        this.slackApp = new App({
            token: args.slackBotToken,
            appToken: args.slackAppToken,
            socketMode: true
        });

        this.botUserId = args.botUserId;

        this.reactions = {
            loading: args.reactions?.loading || 'thinking_face',
            success: args.reactions?.success || 'white_check_mark',
            failed: args.reactions?.failed || 'x'
        };
    }

    registerHandler(hook: CommandHook) {
        this.commandHook = hook;
    }

    async postMessage(message: OutgoingMessage) {
        if (message.dataType === 'text' && typeof message.data === 'string') {
            await this.slackApp.client.chat.postMessage({
                channel: message.channelId,
                thread_ts: message.threadId,
                text: message.data,
            });
        } else if (message.dataType === 'mrkdwn' && typeof message.data === 'string') {
            const block = message.block === 'section' ? 
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: message.data,
                    },
                } : 
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: message.data,
                        },
                    ],
                };
            await this.slackApp.client.chat.postMessage({
                channel: message.channelId,
                thread_ts: message.threadId,
                blocks: [block],
                text: message.data,
            });
        } else if (message.dataType === 'markdown' && typeof message.data === 'string') {
            const mrkdwn = this.markdownToMrkdwn(message.data);

            const block = message.block === 'section' ? 
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: mrkdwn,
                    },
                } : 
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: mrkdwn,
                        },
                    ],
                };

            await this.slackApp.client.chat.postMessage({
                channel: message.channelId,
                thread_ts: message.threadId,
                blocks: [block],
                text: message.data,
            });
        } else if (message.dataType === 'image' && Buffer.isBuffer(message.data)) {
            const ext = getFileTypeFromBuffer(message.data)
            await this.slackApp.client.filesUploadV2({
                channel_id: message.channelId,
                thread_ts: message.threadId,
                file: message.data,
                filename: `data.${ext ?? 'png'}`,
            });
        } else if (message.dataType === 'html' && Buffer.isBuffer(message.data)) {
            await this.slackApp.client.filesUploadV2({
                channel_id: message.channelId,
                thread_ts: message.threadId,
                file: message.data,
                filename: 'data.html',
            });
        } else if (message.dataType === 'txt' && Buffer.isBuffer(message.data)) {
            await this.slackApp.client.filesUploadV2({
                channel_id: message.channelId,
                thread_ts: message.threadId,
                file: message.data,
                filename: 'data.txt',
            });
        } else if ((message.dataType === 'file' || message.dataType === 'binary') && Buffer.isBuffer(message.data)) {
            const ext = getFileTypeFromBuffer(message.data)
            await this.slackApp.client.filesUploadV2({
                channel_id: message.channelId,
                thread_ts: message.threadId,
                file: message.data,
                filename: `data.${ext ?? 'bin'}`,
            });
        }
        
    }



    async processMessage(incomingMessage: IncomingMessage) {
        console.info(`[${new Date().toISOString()}] SLACK_PROCESS_MESSAGE ${JSON.stringify(incomingMessage)}`);

        if (!this.commandHook) {
            return;
        }

        if (this.reactions.loading) {
            await this.slackApp.client.reactions.add({ 
                channel: incomingMessage.channelId,
                name: this.reactions.loading, 
                timestamp: incomingMessage.messageId,
            });
        }

        try {
            if (this.commandHook.isSync) {
                const message = await this.commandHook.handler(incomingMessage);
                if (message) {
                    this.postMessage({
                        dataType: this.commandHook.dataType,
                        block: this.commandHook.block,
                        channelId: incomingMessage.channelId,
                        threadId: incomingMessage.messageId, 
                        data: message,
                    });
                }
                if (this.reactions.success) {
                    await this.slackApp.client.reactions.add({ 
                        channel: incomingMessage.channelId,
                        name: this.reactions.success, 
                        timestamp: incomingMessage.messageId,
                    });
                }
            } else {
                await this.commandHook.handler(incomingMessage);
            }
        } catch (err) {
            console.error(err);
            if (this.reactions.failed) {
                await this.slackApp.client.reactions.add({ 
                    channel: incomingMessage.channelId,
                    name: this.reactions.failed, 
                    timestamp: incomingMessage.messageId,
                });
            }
            await this.postMessage({
                dataType: 'text',
                channelId: incomingMessage.channelId,
                threadId: incomingMessage.messageId, 
                data: `Sorry, something went wrong. (${(err instanceof Error && err.message) ? err.message : ''})`,
            });

        } finally {

            if (this.reactions.loading) {
                await this.slackApp.client.reactions.remove({ 
                    channel: incomingMessage.channelId,
                    name: this.reactions.loading, 
                    timestamp: incomingMessage.messageId,
                });
            }
        }

    }

    async listen(listenArgs: SlackQnaListenArgs) {

        console.info(`[${new Date().toISOString()}] SLACK_START_LISTENING ${JSON.stringify(listenArgs)}`);

        if (listenArgs.directMessage) {
            this.slackApp.message(async ({ message }) => {
                const { ts, thread_ts, channel, text } = <GenericMessageEvent>message;
                if (!text) {
                    return;
                }
                console.info(`[${new Date().toISOString()}] SLACK_RECEIVED_DIRECT_MESSAGE ${JSON.stringify(message)}`);
    
                await this.processMessage({
                    messageId: ts,
                    channelId: channel,
                    threadId: thread_ts,
                    raw: text,
                    message: text,
                });
            });
        }
        
        if (listenArgs.mention) {
            this.slackApp.event('app_mention', async ({ event }) => {        
                const userIdTag = `<@${this.botUserId}>`;
                const { text, ts, channel, thread_ts } = event;
                if (!text.includes(userIdTag)) {
                    return;
                }
                console.info(`[${new Date().toISOString()}] SLACK_RECEIVED_MENTION ${JSON.stringify(event)}`);
    
                await this.processMessage({
                    messageId: ts,
                    channelId: channel,
                    threadId: thread_ts,
                    raw: text,
                    message: text.replace(userIdTag, '').trim(),
                });
            });
        }
    
        
        await this.slackApp.start();
    }

    markdownToMrkdwn(markdown: string) {

        let mrkdwn = markdown;

        mrkdwn = mrkdwn.replace(/\n\s*\n/gm, '\n\n');
        mrkdwn = mrkdwn.replace(/^\s*/gm, '');
        
        // Convert headers
        mrkdwn = mrkdwn.replace(/^# (.*$)/gm, '*$1*');
        mrkdwn = mrkdwn.replace(/^## (.*$)/gm, '*$1*');
        mrkdwn = mrkdwn.replace(/^### (.*$)/gm, '*$1*');

        mrkdwn = mrkdwn.replace(/^### (.*$)/gm, '*$1*');
        
        // Convert bold
        mrkdwn = mrkdwn.replace(/\*\*(.*?)\*\*/g, '*$1*');
        
        // Convert italic
        mrkdwn = mrkdwn.replace(/\_(.*?)\_/g, '_$1_');
        
        // Convert inline code
        mrkdwn = mrkdwn.replace(/`([^`]+)`/g, '`$1`');
        
        // Convert code blocks
        mrkdwn = mrkdwn.replace(/```[\s\S]*?```/g, (match) => {
            return '```' + match.slice(3, -3).trim() + '```';
        });
        
        // Convert links
        mrkdwn = mrkdwn.replace(/\[(.*?)\]\((.*?)\)/g, '<$2|$1>');
        
        // Convert unordered lists
        mrkdwn = mrkdwn.replace(/^\* (.*$)/gm, '• $1');
        
        // Convert ordered lists
        mrkdwn = mrkdwn.replace(/^\d+\. (.*$)/gm, '• $1');
        
        return mrkdwn;
    }
}