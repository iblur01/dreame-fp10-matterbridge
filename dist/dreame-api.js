import { createHash } from 'node:crypto';
export class DreameApiError extends Error {
}
export class DreameAuthError extends DreameApiError {
}
const DREAME_SALT = 'RAylYC%fmSKp7%Tq';
const DREAME_USER_AGENT = 'Dreame_Smarthome/2.1.9 (iPhone; iOS 18.4.1; Scale/3.00)';
const DREAME_AUTH_BASIC = 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=';
const DREAME_TENANT_ID = '000000';
const DREAME_RLC = '1c80b3787b2266776bcdc481f37d8fa42ba10a30af81a6df-1';
export class DreameCloudApi {
    credentials;
    accessToken;
    refreshToken;
    tenantId = DREAME_TENANT_ID;
    tokenExpire;
    constructor(credentials) {
        this.credentials = credentials;
    }
    get apiUrl() {
        return `https://${this.credentials.country}.iot.dreame.tech:13267`;
    }
    async login() {
        const passwordHash = createHash('md5')
            .update(`${this.credentials.password}${DREAME_SALT}`)
            .digest('hex');
        const body = new URLSearchParams({
            platform: 'IOS',
            scope: 'all',
            grant_type: 'password',
            username: this.credentials.username,
            password: passwordHash,
            type: 'account',
        });
        const headers = this.baseAuthHeaders();
        if (this.credentials.country === 'cn')
            headers['Dreame-Rlc'] = DREAME_RLC;
        const response = await fetch(`${this.apiUrl}/dreame-auth/oauth/token`, {
            method: 'POST',
            headers,
            body,
        });
        if (response.status === 400 || response.status === 401 || response.status === 403) {
            throw new DreameAuthError(await response.text());
        }
        if (!response.ok) {
            throw new DreameApiError(`Dreame login failed: ${response.status} ${await response.text()}`);
        }
        const data = (await response.json());
        if (typeof data.access_token !== 'string') {
            throw new DreameAuthError(`Dreame login response did not include an access token`);
        }
        this.accessToken = data.access_token;
        this.refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : undefined;
        this.tenantId = typeof data.tenant_id === 'string' ? data.tenant_id : DREAME_TENANT_ID;
        const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
        this.tokenExpire = Date.now() + (expiresIn - 120) * 1000;
    }
    async getDevices() {
        await this.ensureLogin();
        const response = await fetch(`${this.apiUrl}/dreame-user-iot/iotuserbind/device/listV2`, {
            method: 'POST',
            headers: this.commandHeaders(),
            body: JSON.stringify({}),
        });
        if (response.status === 401) {
            await this.login();
            return this.getDevices();
        }
        if (!response.ok) {
            throw new DreameApiError(`Dreame device discovery failed: ${response.status} ${await response.text()}`);
        }
        const payload = (await response.json());
        if (payload.code !== 0 || !payload.data?.page?.records) {
            throw new DreameApiError(`Dreame device discovery failed: ${JSON.stringify(payload)}`);
        }
        return payload.data.page.records;
    }
    async sendCommand(did, method, params, host) {
        await this.ensureLogin();
        const hostPrefix = host ? `-${host.split('.')[0]}` : '';
        const response = await fetch(`${this.apiUrl}/dreame-iot-com${hostPrefix}/device/sendCommand`, {
            method: 'POST',
            headers: this.commandHeaders(),
            body: JSON.stringify({
                did,
                id: 1,
                data: {
                    did,
                    id: 1,
                    method,
                    params,
                },
            }),
        });
        if (response.status === 401) {
            await this.login();
            return this.sendCommand(did, method, params, host);
        }
        if (!response.ok) {
            throw new DreameApiError(`Dreame command failed: ${response.status} ${await response.text()}`);
        }
        const payload = (await response.json());
        if (payload.code !== 0) {
            throw new DreameApiError(`Dreame command failed: ${JSON.stringify(payload)}`);
        }
        if (payload.data && 'result' in payload.data)
            return payload.data.result;
        if (payload.success)
            return { code: 0 };
        return payload.data;
    }
    async getProperties(did, properties, host) {
        const values = new Map();
        for (const property of properties) {
            const params = [{ did, siid: property.siid, piid: property.piid }];
            try {
                const result = await this.sendCommand(did, 'get_properties', params, host);
                if (!Array.isArray(result))
                    continue;
                for (const item of result) {
                    if (item.code === 0)
                        values.set(`${item.siid}.${item.piid}`, item.value);
                }
            }
            catch {
                continue;
            }
        }
        return values;
    }
    async setProperties(did, properties, host) {
        const params = properties.map((property) => ({ did, ...property }));
        const result = await this.sendCommand(did, 'set_properties', params, host);
        if (!Array.isArray(result) || !result.every((item) => item.code === 0)) {
            throw new DreameApiError(`Dreame set_properties failed: ${JSON.stringify(result)}`);
        }
    }
    async setPower(did, on, host) {
        const result = await this.sendCommand(did, 'action', {
            did,
            siid: 2,
            aiid: 1,
            in: [{ piid: 1, value: on }],
        }, host);
        if (!result || typeof result !== 'object' || result.code !== 0) {
            throw new DreameApiError(`Dreame power action failed: ${JSON.stringify(result)}`);
        }
    }
    async ensureLogin() {
        if (!this.accessToken || !this.tokenExpire || Date.now() >= this.tokenExpire) {
            await this.login();
        }
    }
    baseAuthHeaders() {
        return {
            'User-Agent': DREAME_USER_AGENT,
            Authorization: DREAME_AUTH_BASIC,
            'Tenant-Id': DREAME_TENANT_ID,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
        };
    }
    commandHeaders() {
        return {
            'User-Agent': DREAME_USER_AGENT,
            Authorization: DREAME_AUTH_BASIC,
            'Tenant-Id': this.tenantId,
            'Dreame-Auth': this.accessToken ?? '',
            'Content-Type': 'application/json',
            Accept: '*/*',
        };
    }
}
//# sourceMappingURL=dreame-api.js.map