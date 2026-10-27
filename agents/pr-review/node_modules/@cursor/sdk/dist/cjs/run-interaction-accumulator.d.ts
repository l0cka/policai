import type { SDKMessage } from "./messages.js";
import type { ConversationStep, ConversationTurn } from "./types/conversation-types.js";
import type { InteractionUpdate } from "./types/delta-types.js";
import { type TokenUsage } from "./usage-types.js";
export interface RunInteractionAccumulatorOptions {
    onStep?: (args: {
        step: ConversationStep;
    }) => void | Promise<void>;
    onDelta?: (args: {
        update: InteractionUpdate;
    }) => void | Promise<void>;
}
export declare class RunInteractionAccumulator {
    private readonly options;
    private readonly turns;
    private currentTurn;
    private lastFiredStepIndex;
    private readonly turnUsages;
    constructor(options?: RunInteractionAccumulatorOptions);
    conversation(): ConversationTurn[];
    /** Cumulative usage across turns that reported it; `undefined` when none did. */
    usage(): TokenUsage | undefined;
    finalAssistantText(): string | undefined;
    apply(update: InteractionUpdate): Promise<void>;
    flushPendingStep(): Promise<void>;
    private ensureCurrentTurn;
    private mergeIntoConversation;
    private onUserMessage;
    private onTextDelta;
    private onThinkingDelta;
    private onThinkingCompleted;
    private onTool;
    private didPreviousStepComplete;
}
export declare function accumulateSdkMessageStream(stream: AsyncIterable<SDKMessage>): Promise<ConversationTurn[]>;
export declare function sdkMessageToInteractionUpdate(message: SDKMessage): InteractionUpdate | undefined;
//# sourceMappingURL=run-interaction-accumulator.d.ts.map