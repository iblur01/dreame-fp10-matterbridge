import { airPurifier, airQualitySensor, humiditySensor, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, modeSelect, temperatureSensor, } from 'matterbridge';
import { FanControl } from 'matterbridge/matter/clusters';
import { createRequire } from 'node:module';
import { DreameCloudApi } from './dreame-api.js';
import { AIR_MEASUREMENT_MEDIUM, FP10_MODE_AUTO, FP10_MODE_MANUAL, FP10_MODE_OPTIONS, FP10_PROPERTIES, FP10_SPEED_MAX, FP10_SPEED_MIN, MODEL_FP10, UG_M3, clamp, isOn, modeFromFanMode, speedFromPercent, toAirQuality, toChangeIndication, toFanMode, toPercent, valueToState, } from './fp10-model.js';
const PLUGIN_VERSION = createRequire(import.meta.url)('../package.json').version ?? '0.0.0';
export default function initializePlugin(matterbridge, log, config) {
    return new DreameFp10Platform(matterbridge, log, config);
}
export class DreameFp10Platform extends MatterbridgeDynamicPlatform {
    settings;
    api;
    purifier;
    airQuality;
    temperature;
    humidity;
    modeEndpoint;
    dreameDevice;
    pollTimer;
    state = {};
    updatingMatter = false;
    constructor(matterbridge, log, config) {
        super(matterbridge, log, config);
        if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.7.0')) {
            throw new Error(`This plugin requires Matterbridge >= 3.7.0. Current version: ${this.matterbridge.matterbridgeVersion}`);
        }
        this.settings = readConfig(config);
        this.api = new DreameCloudApi({
            username: this.settings.username,
            password: this.settings.password,
            country: this.settings.country,
        });
        this.log.info(`Dreame FP10 Matterbridge plugin initialized`);
    }
    async onStart(reason) {
        this.log.info(`Starting Dreame FP10 plugin${reason ? ` (${reason})` : ''}`);
        await this.ready;
        await this.clearSelect();
        await this.discoverAndRegister();
    }
    async onConfigure() {
        await super.onConfigure();
        await this.poll();
    }
    async onChangeLoggerLevel(logLevel) {
        this.log.info(`Logger level changed to ${logLevel}`);
    }
    async onShutdown(reason) {
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        await super.onShutdown(reason);
    }
    async discoverAndRegister() {
        await this.api.login();
        const devices = await this.api.getDevices();
        const device = this.selectDevice(devices);
        if (!device) {
            throw new Error(`No Dreame FP10 found. Set "did" in config if auto-discovery cannot identify it.`);
        }
        this.dreameDevice = device;
        const did = String(device.did);
        const serial = sanitizeSerial(device.mac ?? did);
        const name = deviceName(device);
        this.purifier = new MatterbridgeEndpoint(airPurifier, { id: `fp10-${did}` }, this.settings.debug)
            .createDefaultBridgedDeviceBasicInformationClusterServer(name, serial, this.matterbridge.aggregatorVendorId, 'Dreame', 'Dreame FP10 Air Purifier', 10000, PLUGIN_VERSION)
            .createDefaultPowerSourceWiredClusterServer()
            .createDefaultIdentifyClusterServer()
            .createDefaultOnOffClusterServer(false)
            .createCompleteFanControlClusterServer(FanControl.FanMode.Off, FanControl.FanModeSequence.OffLowMedHighAuto, 0, 0, FP10_SPEED_MAX, 0, 0)
            .createDefaultHepaFilterMonitoringClusterServer(100)
            .createDefaultActivatedCarbonFilterMonitoringClusterServer(100)
            .addRequiredClusterServers()
            .addCommandHandler('on', async () => {
            await this.setPower(true);
        })
            .addCommandHandler('off', async () => {
            await this.setPower(false);
        })
            .addCommandHandler('toggle', async () => {
            await this.setPower(!isOn(this.state));
        })
            .addCommandHandler('FanControl.step', async (data) => {
            await this.stepFan(data.request.direction, data.request.wrap ?? false, data.request.lowestOff ?? false);
        });
        this.airQuality = this.purifier
            .addChildDeviceType('AirQuality', airQualitySensor, { id: `fp10-${did}-air-quality` }, this.settings.debug)
            .createDefaultAirQualityClusterServer()
            .createDefaultPm25ConcentrationMeasurementClusterServer(null, UG_M3, AIR_MEASUREMENT_MEDIUM)
            .createDefaultTvocMeasurementClusterServer(null, UG_M3, AIR_MEASUREMENT_MEDIUM)
            .addRequiredClusterServers();
        // Apple Home does not surface temperature/humidity that live inside the air
        // quality endpoint, so expose them as their own sensor device types.
        this.temperature = this.purifier
            .addChildDeviceType('Temperature', temperatureSensor, { id: `fp10-${did}-temperature` }, this.settings.debug)
            .createDefaultTemperatureMeasurementClusterServer(null)
            .addRequiredClusterServers();
        this.humidity = this.purifier
            .addChildDeviceType('Humidity', humiditySensor, { id: `fp10-${did}-humidity` }, this.settings.debug)
            .createDefaultRelativeHumidityMeasurementClusterServer(null)
            .addRequiredClusterServers();
        this.modeEndpoint = this.purifier
            .addChildDeviceType('Mode', modeSelect, { id: `fp10-${did}-mode` }, this.settings.debug)
            .createDefaultModeSelectClusterServer('Purifier mode', FP10_MODE_OPTIONS, FP10_MODE_AUTO, FP10_MODE_AUTO)
            .addRequiredClusterServers()
            .addCommandHandler('ModeSelect.changeToMode', async (data) => {
            await this.setMode(data.request.newMode);
        });
        this.setSelectDevice(serial, name, undefined, 'air-purifier', [
            { name: 'AirQuality', description: 'PM2.5, TVOC, temperature and humidity', icon: 'air-filter' },
            { name: 'Mode', description: 'Auto, Sleep, Manual and Pet modes', icon: 'tune' },
        ]);
        await this.registerDevice(this.purifier);
        await this.subscribeMatterWrites();
        await this.poll();
        this.pollTimer = setInterval(() => {
            void this.poll();
        }, this.settings.pollingInterval);
    }
    selectDevice(devices) {
        if (this.settings.did) {
            return devices.find((device) => String(device.did) === this.settings.did);
        }
        return devices.find((device) => {
            const model = device.model ?? device.subModel;
            return model === MODEL_FP10 || device.categoryPath?.endsWith('/airp');
        });
    }
    async subscribeMatterWrites() {
        if (!this.purifier || !this.modeEndpoint)
            return;
        await this.purifier.subscribeAttribute('FanControl', 'percentSetting', (newValue) => {
            if (this.updatingMatter || typeof newValue !== 'number')
                return;
            void this.setFanSpeed(speedFromPercent(newValue));
        });
        await this.purifier.subscribeAttribute('FanControl', 'speedSetting', (newValue) => {
            if (this.updatingMatter || typeof newValue !== 'number' || newValue <= 0)
                return;
            void this.setFanSpeed(clamp(newValue, FP10_SPEED_MIN, FP10_SPEED_MAX));
        });
        await this.purifier.subscribeAttribute('FanControl', 'fanMode', (newValue) => {
            if (this.updatingMatter || typeof newValue !== 'number')
                return;
            void this.setFanMode(newValue);
        });
        await this.modeEndpoint.subscribeAttribute('ModeSelect', 'currentMode', (newValue) => {
            if (this.updatingMatter || typeof newValue !== 'number')
                return;
            void this.setMode(newValue);
        });
    }
    async poll() {
        if (!this.dreameDevice)
            return;
        try {
            const did = String(this.dreameDevice.did);
            const values = await this.api.getProperties(did, Object.values(FP10_PROPERTIES), this.dreameDevice.bindDomain);
            this.state = { ...this.state, ...valueToState(values) };
            await this.updateMatterState();
        }
        catch (error) {
            this.log.error(`Failed polling Dreame FP10: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updateMatterState() {
        if (!this.purifier || !this.airQuality || !this.modeEndpoint)
            return;
        this.updatingMatter = true;
        try {
            const on = isOn(this.state);
            const percent = toPercent(this.state);
            const speed = on ? clamp(this.state.fanSpeed ?? 0, 0, FP10_SPEED_MAX) : 0;
            await this.safeUpdate(this.purifier, 'OnOff', 'onOff', on);
            await this.safeUpdate(this.purifier, 'FanControl', 'fanMode', toFanMode(this.state));
            await this.safeUpdate(this.purifier, 'FanControl', 'percentSetting', percent);
            await this.safeUpdate(this.purifier, 'FanControl', 'percentCurrent', percent);
            await this.safeUpdate(this.purifier, 'FanControl', 'speedSetting', speed);
            await this.safeUpdate(this.purifier, 'FanControl', 'speedCurrent', speed);
            await this.safeUpdate(this.purifier, 'HepaFilterMonitoring', 'condition', this.state.hepaLife ?? null);
            await this.safeUpdate(this.purifier, 'HepaFilterMonitoring', 'changeIndication', toChangeIndication(this.state.hepaLife));
            await this.safeUpdate(this.purifier, 'ActivatedCarbonFilterMonitoring', 'condition', this.state.carbonLife ?? null);
            await this.safeUpdate(this.purifier, 'ActivatedCarbonFilterMonitoring', 'changeIndication', toChangeIndication(this.state.carbonLife));
            await this.safeUpdate(this.airQuality, 'AirQuality', 'airQuality', toAirQuality(this.state));
            await this.safeUpdate(this.airQuality, 'Pm25ConcentrationMeasurement', 'measuredValue', this.state.pm25 ?? null);
            await this.safeUpdate(this.airQuality, 'TotalVolatileOrganicCompoundsConcentrationMeasurement', 'measuredValue', this.state.tvoc ?? null);
            if (this.temperature) {
                await this.safeUpdate(this.temperature, 'TemperatureMeasurement', 'measuredValue', typeof this.state.temperature === 'number' ? Math.round(this.state.temperature * 100) : null);
            }
            if (this.humidity) {
                await this.safeUpdate(this.humidity, 'RelativeHumidityMeasurement', 'measuredValue', typeof this.state.humidity === 'number' ? Math.round(this.state.humidity * 100) : null);
            }
            await this.safeUpdate(this.modeEndpoint, 'ModeSelect', 'currentMode', this.state.mode ?? FP10_MODE_AUTO);
        }
        finally {
            this.updatingMatter = false;
        }
    }
    async setPower(on) {
        if (!this.dreameDevice)
            return;
        await this.api.setPower(String(this.dreameDevice.did), on, this.dreameDevice.bindDomain);
        this.state.power = on ? 1 : 2;
        await this.updateMatterState();
    }
    async setFanSpeed(speed) {
        if (!this.dreameDevice)
            return;
        const clamped = clamp(speed, FP10_SPEED_MIN, FP10_SPEED_MAX);
        await this.api.setProperties(String(this.dreameDevice.did), [
            { siid: 2, piid: 3, value: FP10_MODE_MANUAL },
            { siid: 2, piid: 4, value: clamped },
        ], this.dreameDevice.bindDomain);
        this.state.power = 1;
        this.state.mode = FP10_MODE_MANUAL;
        this.state.fanSpeed = clamped;
        await this.updateMatterState();
    }
    async setMode(mode) {
        if (!this.dreameDevice)
            return;
        if (!FP10_MODE_OPTIONS.some((option) => option.mode === mode))
            return;
        await this.api.setProperties(String(this.dreameDevice.did), [{ siid: 2, piid: 3, value: mode }], this.dreameDevice.bindDomain);
        this.state.power = 1;
        this.state.mode = mode;
        await this.updateMatterState();
    }
    async setFanMode(fanMode) {
        if (fanMode === FanControl.FanMode.Off) {
            await this.setPower(false);
            return;
        }
        const mode = modeFromFanMode(fanMode);
        if (mode !== undefined)
            await this.setMode(mode);
    }
    async stepFan(direction, wrap, lowestOff) {
        const current = this.state.fanSpeed ?? FP10_SPEED_MIN;
        const delta = direction === FanControl.StepDirection.Increase ? 1 : -1;
        let next = current + delta;
        if (next < FP10_SPEED_MIN) {
            if (lowestOff) {
                await this.setPower(false);
                return;
            }
            next = wrap ? FP10_SPEED_MAX : FP10_SPEED_MIN;
        }
        if (next > FP10_SPEED_MAX)
            next = wrap ? FP10_SPEED_MIN : FP10_SPEED_MAX;
        await this.setFanSpeed(next);
    }
    async safeUpdate(endpoint, cluster, attribute, value) {
        const ok = await endpoint.updateAttribute(cluster, attribute, value, this.log);
        if (!ok && this.settings.debug)
            this.log.debug(`Skipped Matter update ${cluster}.${attribute}`);
    }
}
function readConfig(config) {
    const username = readString(config, 'username');
    const password = readString(config, 'password');
    if (!username || !password)
        throw new Error('Dreame FP10 plugin requires username and password');
    return {
        username,
        password,
        country: readString(config, 'country') || 'eu',
        did: readString(config, 'did') || undefined,
        pollingInterval: Math.max(5000, readNumber(config, 'pollingInterval', 10000)),
        debug: readBoolean(config, 'debug', false),
    };
}
function readString(config, key) {
    const value = config[key];
    return typeof value === 'string' ? value.trim() : '';
}
function readNumber(config, key, defaultValue) {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}
function readBoolean(config, key, defaultValue) {
    const value = config[key];
    return typeof value === 'boolean' ? value : defaultValue;
}
function deviceName(device) {
    return device.customName ?? device.displayName ?? device.deviceInfo?.displayName ?? 'Dreame FP10';
}
function sanitizeSerial(value) {
    return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'DREAMEFP10';
}
//# sourceMappingURL=index.js.map