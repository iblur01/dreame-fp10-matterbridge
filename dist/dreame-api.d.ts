export declare class DreameApiError extends Error {
}
export declare class DreameAuthError extends DreameApiError {
}
export interface DreameDevice {
    did: string | number;
    bindDomain?: string;
    model?: string;
    subModel?: string;
    mac?: string;
    displayName?: string;
    customName?: string;
    categoryPath?: string;
    deviceInfo?: {
        displayName?: string;
    };
}
export interface DreameCredentials {
    username: string;
    password: string;
    country: string;
}
export declare class DreameCloudApi {
    private readonly credentials;
    private accessToken?;
    private refreshToken?;
    private tenantId;
    private tokenExpire?;
    constructor(credentials: DreameCredentials);
    get apiUrl(): string;
    login(): Promise<void>;
    getDevices(): Promise<DreameDevice[]>;
    sendCommand(did: string, method: string, params: unknown, host?: string): Promise<unknown>;
    getProperties(did: string, properties: {
        siid: number;
        piid: number;
    }[], host?: string): Promise<Map<string, unknown>>;
    setProperties(did: string, properties: {
        siid: number;
        piid: number;
        value: unknown;
    }[], host?: string): Promise<void>;
    setPower(did: string, on: boolean, host?: string): Promise<void>;
    private ensureLogin;
    private baseAuthHeaders;
    private commandHeaders;
}
