import { CreateUserApiKeyRequest, GetMeRequest } from "@anysphere/proto/aiserver/v1/dashboard_pb.js";
/**
 * Post-login step: use the (short-lived hold on the) browser-login session
 * token to mint a named, expiring user API key via
 * `DashboardService/CreateUserApiKey`, then discard the session token. The
 * minted key is the credential the SDK persists and uses everywhere.
 */
export interface MintApiKeyOptions {
    backendUrl: string;
    accessToken: string;
    name: string;
    /** Epoch ms; omit for a key that never expires. */
    expiresAtMs?: number;
}
export interface MintApiKeyResult {
    apiKey: string;
    email?: string;
}
/** The two DashboardService methods the mint step needs; a test seam. */
export interface MintClient {
    createUserApiKey(req: CreateUserApiKeyRequest): Promise<{
        apiKey: string;
    }>;
    getMe(req: GetMeRequest): Promise<{
        email?: string;
    }>;
}
export declare function mintUserApiKey(options: MintApiKeyOptions, clientForTests?: MintClient): Promise<MintApiKeyResult>;
//# sourceMappingURL=mint-api-key.d.ts.map