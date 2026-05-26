import { AirQuality, ConcentrationMeasurement, FanControl, ResourceMonitoring } from 'matterbridge/matter/clusters';
export const MODEL_FP10 = 'dreame.airp.u2513';
export const FP10_MODE_AUTO = 0;
export const FP10_MODE_SLEEP = 2;
export const FP10_MODE_MANUAL = 3;
export const FP10_MODE_PET = 4;
export const FP10_POWER_ON = 1;
export const FP10_POWER_STANDBY = 2;
export const FP10_SPEED_MIN = 1;
export const FP10_SPEED_MAX = 10;
export const FP10_PROPERTIES = {
    power: { siid: 2, piid: 1 },
    mode: { siid: 2, piid: 3 },
    fanSpeed: { siid: 2, piid: 4 },
    humidity: { siid: 3, piid: 2 },
    temperature: { siid: 3, piid: 3 },
    airQualityLevel: { siid: 3, piid: 4 },
    pm25: { siid: 3, piid: 5 },
    tvoc: { siid: 3, piid: 6 },
    hepaLife: { siid: 4, piid: 1 },
    hepaDays: { siid: 4, piid: 2 },
    carbonLife: { siid: 4, piid: 5 },
    carbonMetric: { siid: 4, piid: 6 },
};
export const FP10_MODE_OPTIONS = [
    { label: 'Auto', mode: FP10_MODE_AUTO, semanticTags: [] },
    { label: 'Sleep', mode: FP10_MODE_SLEEP, semanticTags: [] },
    { label: 'Manual', mode: FP10_MODE_MANUAL, semanticTags: [] },
    { label: 'Pet', mode: FP10_MODE_PET, semanticTags: [] },
];
export function valueToState(values) {
    const state = {};
    for (const [key, property] of Object.entries(FP10_PROPERTIES)) {
        const value = values.get(`${property.siid}.${property.piid}`);
        if (typeof value === 'number') {
            state[key] = value;
        }
    }
    return state;
}
export function isOn(state) {
    return state.power === FP10_POWER_ON;
}
export function toFanMode(state) {
    if (!isOn(state))
        return FanControl.FanMode.Off;
    switch (state.mode) {
        case FP10_MODE_AUTO:
            return FanControl.FanMode.Auto;
        case FP10_MODE_SLEEP:
            return FanControl.FanMode.Low;
        case FP10_MODE_PET:
            return FanControl.FanMode.High;
        case FP10_MODE_MANUAL:
            return FanControl.FanMode.On;
        default:
            return FanControl.FanMode.On;
    }
}
export function modeFromFanMode(fanMode) {
    switch (fanMode) {
        case FanControl.FanMode.Off:
            return undefined;
        case FanControl.FanMode.Auto:
        case FanControl.FanMode.Smart:
            return FP10_MODE_AUTO;
        case FanControl.FanMode.Low:
            return FP10_MODE_SLEEP;
        case FanControl.FanMode.High:
            return FP10_MODE_PET;
        case FanControl.FanMode.Medium:
        case FanControl.FanMode.On:
            return FP10_MODE_MANUAL;
    }
}
export function toPercent(state) {
    if (!isOn(state))
        return 0;
    return clamp((state.fanSpeed ?? FP10_SPEED_MIN) * 10, 0, 100);
}
export function speedFromPercent(percent) {
    return clamp(Math.round(percent / 10), FP10_SPEED_MIN, FP10_SPEED_MAX);
}
export function toAirQuality(state) {
    if (typeof state.airQualityLevel === 'number' && state.airQualityLevel > 0) {
        if (state.airQualityLevel <= 1)
            return AirQuality.AirQualityEnum.Good;
        if (state.airQualityLevel === 2)
            return AirQuality.AirQualityEnum.Fair;
        if (state.airQualityLevel === 3)
            return AirQuality.AirQualityEnum.Moderate;
        if (state.airQualityLevel === 4)
            return AirQuality.AirQualityEnum.Poor;
        return AirQuality.AirQualityEnum.VeryPoor;
    }
    if (typeof state.pm25 !== 'number')
        return AirQuality.AirQualityEnum.Unknown;
    if (state.pm25 <= 12)
        return AirQuality.AirQualityEnum.Good;
    if (state.pm25 <= 35)
        return AirQuality.AirQualityEnum.Fair;
    if (state.pm25 <= 55)
        return AirQuality.AirQualityEnum.Moderate;
    if (state.pm25 <= 150)
        return AirQuality.AirQualityEnum.Poor;
    if (state.pm25 <= 250)
        return AirQuality.AirQualityEnum.VeryPoor;
    return AirQuality.AirQualityEnum.ExtremelyPoor;
}
export function toChangeIndication(condition) {
    if (typeof condition !== 'number')
        return ResourceMonitoring.ChangeIndication.Ok;
    if (condition <= 5)
        return ResourceMonitoring.ChangeIndication.Critical;
    if (condition <= 15)
        return ResourceMonitoring.ChangeIndication.Warning;
    return ResourceMonitoring.ChangeIndication.Ok;
}
export const AIR_MEASUREMENT_MEDIUM = ConcentrationMeasurement.MeasurementMedium.Air;
export const UG_M3 = ConcentrationMeasurement.MeasurementUnit.Ugm3;
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=fp10-model.js.map