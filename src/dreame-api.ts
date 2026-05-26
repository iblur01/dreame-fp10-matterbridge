import { createHash } from 'node:crypto';

export class DreameApiError extends Error {}
export class DreameAuthError extends DreameApiError {}

const DREAME_SALT = 'RAylYC%fmSKp7%Tq';
const DREAME_USER_AGENT = 'Dreame_Smarthome/2.1.9 (iPhone; iOS 18.4.1; Scale/3.00)';
const DREAME_AUTH_BASIC = 'Basic ZHJlYW1lX2FwcHYxOkFQXmR2QHpAU1FZVnhOODg=';
const DREAME_TENANT_ID = '000000';
const DREAME_RLC = '1c80b3787b2266776bcdc481f37d8fa42ba10a30af81a6df-1';

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

export class DreameCloudApi {
  private accessToken?: string;
  private refreshToken?: string;
  private tenantId = DREAME_TENANT_ID;
  private tokenExpire?: number;

  constructor(private readonly credentials: DreameCredentials) {}

  get apiUrl(): string {
    return `https://${this.credentials.country}.iot.dreame.tech:13267`;
  }

  async login(): Promise<void> {
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
    if (this.credentials.country === 'cn') headers['Dreame-Rlc'] = DREAME_RLC;

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

    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.access_token !== 'string') {
      throw new DreameAuthError(`Dreame login response did not include an access token`);
    }

    this.accessToken = data.access_token;
    this.refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : undefined;
    this.tenantId = typeof data.tenant_id === 'string' ? data.tenant_id : DREAME_TENANT_ID;
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    this.tokenExpire = Date.now() + (expiresIn - 120) * 1000;
  }

  async getDevices(): Promise<DreameDevice[]> {
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

    const payload = (await response.json()) as Record<string, any>;
    if (payload.code !== 0 || !payload.data?.page?.records) {
      throw new DreameApiError(`Dreame device discovery failed: ${JSON.stringify(payload)}`);
    }
    return payload.data.page.records as DreameDevice[];
  }

  async sendCommand(did: string, method: string, params: unknown, host?: string): Promise<unknown> {
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

    const payload = (await response.json()) as Record<string, any>;
    if (payload.code !== 0) {
      throw new DreameApiError(`Dreame command failed: ${JSON.stringify(payload)}`);
    }
    if (payload.data && 'result' in payload.data) return payload.data.result;
    if (payload.success) return { code: 0 };
    return payload.data;
  }

  async getProperties(
    did: string,
    properties: { siid: number; piid: number }[],
    host?: string,
  ): Promise<Map<string, unknown>> {
    const values = new Map<string, unknown>();
    for (const property of properties) {
      const params = [{ did, siid: property.siid, piid: property.piid }];
      try {
        const result = await this.sendCommand(did, 'get_properties', params, host);
        if (!Array.isArray(result)) continue;
        for (const item of result as Record<string, any>[]) {
          if (item.code === 0) values.set(`${item.siid}.${item.piid}`, item.value);
        }
      } catch {
        continue;
      }
    }
    return values;
  }

  async setProperties(
    did: string,
    properties: { siid: number; piid: number; value: unknown }[],
    host?: string,
  ): Promise<void> {
    const params = properties.map((property) => ({ did, ...property }));
    const result = await this.sendCommand(did, 'set_properties', params, host);
    if (!Array.isArray(result) || !(result as Record<string, any>[]).every((item) => item.code === 0)) {
      throw new DreameApiError(`Dreame set_properties failed: ${JSON.stringify(result)}`);
    }
  }

  async setPower(did: string, on: boolean, host?: string): Promise<void> {
    const result = await this.sendCommand(
      did,
      'action',
      {
        did,
        siid: 2,
        aiid: 1,
        in: [{ piid: 1, value: on }],
      },
      host,
    );
    if (!result || typeof result !== 'object' || (result as { code?: number }).code !== 0) {
      throw new DreameApiError(`Dreame power action failed: ${JSON.stringify(result)}`);
    }
  }

  private async ensureLogin(): Promise<void> {
    if (!this.accessToken || !this.tokenExpire || Date.now() >= this.tokenExpire) {
      await this.login();
    }
  }

  private baseAuthHeaders(): Record<string, string> {
    return {
      'User-Agent': DREAME_USER_AGENT,
      Authorization: DREAME_AUTH_BASIC,
      'Tenant-Id': DREAME_TENANT_ID,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
    };
  }

  private commandHeaders(): Record<string, string> {
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
