import { AirQuality, ConcentrationMeasurement, FanControl, ModeSelect, ResourceMonitoring } from 'matterbridge/matter/clusters';
export declare const MODEL_FP10 = "dreame.airp.u2513";
export declare const FP10_MODE_AUTO = 0;
export declare const FP10_MODE_SLEEP = 2;
export declare const FP10_MODE_MANUAL = 3;
export declare const FP10_MODE_PET = 4;
export declare const FP10_POWER_ON = 1;
export declare const FP10_POWER_STANDBY = 2;
export declare const FP10_SPEED_MIN = 1;
export declare const FP10_SPEED_MAX = 10;
export declare const FP10_PROPERTIES: {
    readonly power: {
        readonly siid: 2;
        readonly piid: 1;
    };
    readonly mode: {
        readonly siid: 2;
        readonly piid: 3;
    };
    readonly fanSpeed: {
        readonly siid: 2;
        readonly piid: 4;
    };
    readonly humidity: {
        readonly siid: 3;
        readonly piid: 2;
    };
    readonly temperature: {
        readonly siid: 3;
        readonly piid: 3;
    };
    readonly airQualityLevel: {
        readonly siid: 3;
        readonly piid: 4;
    };
    readonly pm25: {
        readonly siid: 3;
        readonly piid: 5;
    };
    readonly tvoc: {
        readonly siid: 3;
        readonly piid: 6;
    };
    readonly hepaLife: {
        readonly siid: 4;
        readonly piid: 1;
    };
    readonly hepaDays: {
        readonly siid: 4;
        readonly piid: 2;
    };
    readonly carbonLife: {
        readonly siid: 4;
        readonly piid: 5;
    };
    readonly carbonMetric: {
        readonly siid: 4;
        readonly piid: 6;
    };
};
export interface Fp10State {
    power?: number;
    mode?: number;
    fanSpeed?: number;
    humidity?: number;
    temperature?: number;
    airQualityLevel?: number;
    pm25?: number;
    tvoc?: number;
    hepaLife?: number;
    hepaDays?: number;
    carbonLife?: number;
    carbonMetric?: number;
}
export declare const FP10_MODE_OPTIONS: ModeSelect.ModeOption[];
export declare function valueToState(values: Map<string, unknown>): Fp10State;
export declare function isOn(state: Fp10State): boolean;
export declare function toFanMode(state: Fp10State): FanControl.FanMode;
export declare function modeFromFanMode(fanMode: FanControl.FanMode): number | undefined;
export declare function toPercent(state: Fp10State): number;
export declare function speedFromPercent(percent: number): number;
export declare function toAirQuality(state: Fp10State): AirQuality.AirQualityEnum;
export declare function toChangeIndication(condition?: number): ResourceMonitoring.ChangeIndication;
export declare const AIR_MEASUREMENT_MEDIUM = ConcentrationMeasurement.MeasurementMedium.Air;
export declare const UG_M3 = ConcentrationMeasurement.MeasurementUnit.Ugm3;
export declare function clamp(value: number, min: number, max: number): number;
