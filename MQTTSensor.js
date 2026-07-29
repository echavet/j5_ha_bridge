const { Sensor } = require('johnny-five');
const util = require('./util.js');
const debug = require('debug')('MQTTSensor');
const info = require('debug')('infos');
const SLUG = "j5_ha_bridge";
const regression = require('regression');

/** Default consecutive max_jump rejects before accepting a new baseline. */
const DEFAULT_MAX_JUMP_STREAK = 5;

/** DFRobot Gravity ORP (SEN0165 sample): Uno-style 5 V / 10-bit defaults. */
const DFROBOT_ORP_VREF_MV = 5000;
const DFROBOT_ORP_ADC_MAX = 1024;

/**
 * Median of a numeric array (copy-sort; does not mutate input).
 * @param {number[]} values
 * @returns {number|undefined}
 */
function medianOf(values) {
    if (!values || values.length === 0) {
        return undefined;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * HA addon schema bool? → real boolean (reject stringly "false").
 * @param {*} v
 * @returns {boolean}
 */
function isConfigTrue(v) {
    return v === true;
}

/**
 * DFRobot SEN0165 / Gravity ORP official sample (without OFFSET).
 * ORP_raw = ((30 * Vref_mV) - (75 * voltage_mV)) / 75
 * With Vref=5000: equivalent to 2000 - voltage_mV.
 *
 * @param {number} adc raw ADC count (0…1023 on Uno)
 * @param {number} [vrefMv=5000]
 * @param {number} [adcMax=1024] DFRobot sample uses 1024, not 1023
 * @returns {number} ORP in mV before OFFSET
 */
function dfrobotOrpRaw(adc, vrefMv = DFROBOT_ORP_VREF_MV, adcMax = DFROBOT_ORP_ADC_MAX) {
    const voltageMv = (Number(adc) * vrefMv) / adcMax;
    return ((30 * vrefMv) - (75 * voltageMv)) / 75;
}

/**
 * Mean OFFSET so that ORP = ORP_raw(adc) - OFFSET matches calibration points.
 * OFFSET_i = ORP_raw(x_i) - y_i ; one point is enough.
 *
 * @param {Array<[number, number]>} dataPoints [adc, expected_mV][]
 * @returns {number}
 */
function computeDfrobotOffset(dataPoints) {
    let sum = 0;
    for (const [x, y] of dataPoints) {
        sum += dfrobotOrpRaw(x) - Number(y);
    }
    return sum / dataPoints.length;
}

class MQTTSensor extends Sensor {
    constructor(options, mqttManager, addonConfig, sensorConfig) {
        super(options);

        this.mqttManager = mqttManager;
        this.addonConfig = addonConfig;
        this.sensorConfig = sensorConfig;
        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;
        this.unique_id = `${util.convertWith_(this.sensorConfig.name)}_on_pin_${this.sensorConfig.pin}`;

        this.calibrationConfiguration(sensorConfig, addonConfig);
        this.filterConfiguration(sensorConfig);

        // Companion HA entities (real sensors → full history; attributes alone are hard to historize).
        this.publishRaw = isConfigTrue(sensorConfig.publish_raw);
        // Calibrated companion only makes sense when a calibration curve exists.
        this.publishCalibrated = isConfigTrue(sensorConfig.publish_calibrated) && !!this.calibration;

        // Generate a unique MQTT topic for this sensor
        this.stateTopic = `${SLUG}/sensor/${this.unique_id}`;

        this.announce();
        // Subscribe to the sensor's change event
        this.on('change', this.handleChange.bind(this));
    }

    /**
     * Optional multi-sample / jump / range filtering (after Johnny-Five's per-interval median).
     * All options are optional — omit them for previous behaviour.
     */
    filterConfiguration(sensorConfig) {
        const n = parseInt(sensorConfig.filter_samples, 10);
        this.filterSamples = Number.isFinite(n) && n > 1 ? n : 1;
        this.rawWindow = [];

        this.maxJump = sensorConfig.max_jump != null && sensorConfig.max_jump !== ''
            ? Number(sensorConfig.max_jump)
            : null;
        const streak = parseInt(sensorConfig.max_jump_streak, 10);
        this.maxJumpStreak = Number.isFinite(streak) && streak > 0
            ? streak
            : DEFAULT_MAX_JUMP_STREAK;
        this.jumpRejectStreak = 0;

        this.valueMin = sensorConfig.value_min != null && sensorConfig.value_min !== ''
            ? Number(sensorConfig.value_min)
            : null;
        this.valueMax = sensorConfig.value_max != null && sensorConfig.value_max !== ''
            ? Number(sensorConfig.value_max)
            : null;

        this.lastPublishedValue = undefined;

        if (this.filterSamples > 1 || this.maxJump != null || this.valueMin != null || this.valueMax != null) {
            info(`${sensorConfig.name} filter: samples=${this.filterSamples}` +
                `${this.maxJump != null ? ` max_jump=${this.maxJump} streak=${this.maxJumpStreak}` : ''}` +
                `${this.valueMin != null ? ` value_min=${this.valueMin}` : ''}` +
                `${this.valueMax != null ? ` value_max=${this.valueMax}` : ''}`);
        }
    }

    /**
     * Loads calibration configuration for this sensor and stores the ones concerning this sensor
     * @param {*} sensorConfig
     * @param {*} addonConfig
     */
    calibrationConfiguration(sensorConfig, addonConfig) {
        this.calibration_set = sensorConfig.calibration_set;
        this.calibration_sets = addonConfig.calibration_sets;
        this.dfrobotOffset = undefined;

        if (this.calibration_set) {         // the sensor is to be scaled thanks to calibration points
            this.calibration = {};
            if (this.calibration_sets) {    // it exists cal. sets in config

                this.calibrationType = sensorConfig.calibration_type || "linear";
                this.calibrationPrecision = sensorConfig.calibration_precision || 8;
                this.calibrationOrder = sensorConfig.calibration_order || 3;

                this.addonConfig.calibration_sets.forEach(point => {
                    if (point.set == this.calibration_set) {
                        if (!this.calibration.x_points) { this.calibration.x_points = []; }
                        if (!this.calibration.y_points) { this.calibration.y_points = []; }
                        if (!this.calibration.data_points) { this.calibration.data_points = []; }
                        // those 2 ones are for const everpolate lib
                        this.calibration.x_points.push(point.x_point);
                        this.calibration.y_points.push(point.y_point);
                        // this one is for regression lib / dfrobot offset
                        this.calibration.data_points.push([point.x_point, point.y_point]);
                    }
                });
            }
            if (!this.calibration.x_points) {
                this.emit("error",
                    new Error('Configuration Error: You have to provide a calibration_set with points and "set" set corresponding set'));
                return;
            }

            if (this.calibrationType === 'dfrobot_orp') {
                // Native DFRobot slope; OFFSET from calibration point(s). order/precision unused.
                this.dfrobotOffset = computeDfrobotOffset(this.calibration.data_points);
                info(`${sensorConfig.name} sensor is calibrated using DFRobot ORP formula (SEN0165 sample)`);
                info(`dfrobot_orp: Vref=${DFROBOT_ORP_VREF_MV} mV adcMax=${DFROBOT_ORP_ADC_MAX}  OFFSET=${this.dfrobotOffset}  (from ${this.calibration.data_points.length} point(s))`);
                info(`dfrobot_orp: calibration_order / calibration_precision are ignored for this type`);
            }
        }
    }

    /**
     * Convert filtered ADC to engineering units (or pass-through if no calibration).
     * @param {number} adc
     * @returns {number}
     */
    applyCalibration(adc) {
        if (!this.calibration) {
            return adc;
        }

        if (this.calibrationType === 'dfrobot_orp') {
            return dfrobotOrpRaw(adc) - this.dfrobotOffset;
        }

        // linear | polynomial | exponential | logarithmic | power via regression lib
        if (!this.regression) {
            if (typeof regression[this.calibrationType] !== 'function') {
                throw new Error(`Unknown calibration_type: ${this.calibrationType}`);
            }
            this.regression = regression[this.calibrationType](this.calibration.data_points,
                { order: this.calibrationOrder, precision: this.calibrationPrecision });

            info(`${this.sensorConfig.name} sensor is calibrated using regression  : ${this.calibrationType}`);
            info(`${this.regression.string}`);
            info(`r2 : ${this.regression.r2}`);
        }
        return this.regression.predict(adc)[1];
    }

    /**
     * Shared HA "device" block so main + diagnostic entities group together.
     */
    haDevice() {
        return {
            name: this.sensorConfig.name,
            identifiers: [this.unique_id],
            manufacturer: SLUG,
        };
    }

    discoveryConfigTopic(uniqueId) {
        return `${this.addonConfig.discovery_topic}/sensor/${uniqueId}/config`;
    }

    /**
     * Publish MQTT discovery, or clear a retained config when discovery is null/empty.
     * @param {string} uniqueId
     * @param {object|null} discovery discovery payload, or null to remove entity
     */
    publishDiscovery(uniqueId, discovery) {
        const topic = this.discoveryConfigTopic(uniqueId);
        if (!discovery) {
            debug(`clear discovery topic: ${topic}`);
            this.mqttClient.publish(topic, '', { retain: true });
            return;
        }
        debug(`config topic: ${topic}`);
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(discovery, null, 2)}`);
        this.mqttClient.publish(topic, JSON.stringify(discovery), { retain: true });
    }

    announce() {
        const main = {
            unique_id: `${this.unique_id}`,
            name: this.sensorConfig.name,
            device_class: this.sensorConfig.device_class,
            state_topic: this.stateTopic,
            unit_of_measurement: this.sensorConfig.unit,
            value_template: '{{ value_json.value }}',
            json_attributes_topic: this.stateTopic,
            json_attributes_template: '{{ value_json.attributes | tojson }}',
            // Always set for HA history graphs (was previously only set if this.state_class existed — never wired)
            state_class: this.sensorConfig.state_class || 'measurement',
            device: this.haDevice(),
        };

        this.publishDiscovery(this.unique_id, main);

        // Companions share the same JSON state_topic; value_template selects the field.
        // Clear retained discovery when disabled so HA does not keep zombie entities.
        if (this.publishRaw) {
            this.publishDiscovery(`${this.unique_id}_raw`, {
                unique_id: `${this.unique_id}_raw`,
                name: `${this.sensorConfig.name} raw`,
                state_topic: this.stateTopic,
                unit_of_measurement: 'ADC',
                value_template: '{{ value_json.attributes.raw_value }}',
                state_class: 'measurement',
                entity_category: 'diagnostic',
                device: this.haDevice(),
            });
            info(`${this.sensorConfig.name}: MQTT discovery for raw ADC companion entity`);
        } else {
            this.publishDiscovery(`${this.unique_id}_raw`, null);
        }

        if (this.publishCalibrated) {
            this.publishDiscovery(`${this.unique_id}_calibrated`, {
                unique_id: `${this.unique_id}_calibrated`,
                name: `${this.sensorConfig.name} calibrated`,
                state_topic: this.stateTopic,
                unit_of_measurement: this.sensorConfig.unit,
                // Post filter_samples + calibration, pre min/max/max_jump guards
                value_template: '{{ value_json.attributes.calibrated }}',
                state_class: 'measurement',
                entity_category: 'diagnostic',
                device: this.haDevice(),
            });
            info(`${this.sensorConfig.name}: MQTT discovery for pre-guard calibrated companion entity`);
        } else {
            this.publishDiscovery(`${this.unique_id}_calibrated`, null);
            if (isConfigTrue(this.sensorConfig.publish_calibrated) && !this.calibration) {
                info(`${this.sensorConfig.name}: publish_calibrated ignored (no calibration_set)`);
            }
        }
    }

    /**
     * Sliding median on successive Johnny-Five readings (already median-filtered per interval).
     * @param {number} sample
     * @returns {number}
     */
    applySampleWindow(sample) {
        if (this.filterSamples <= 1) {
            return sample;
        }
        this.rawWindow.push(sample);
        while (this.rawWindow.length > this.filterSamples) {
            this.rawWindow.shift();
        }
        return medianOf(this.rawWindow);
    }

    /**
     * After calibration: reject absurd jumps / out-of-range values (keep last good),
     * but accept a new baseline after max_jump_streak consecutive jump rejects
     * so a lasting step change (minutes) is not locked out forever.
     * @param {number} candidate
     * @returns {{ value: number, accepted: boolean, reason: string|null }}
     */
    applyValueGuards(candidate) {
        if (candidate == null || Number.isNaN(candidate)) {
            this.jumpRejectStreak = 0;
            return {
                value: this.lastPublishedValue,
                accepted: false,
                reason: 'nan',
            };
        }

        if (this.valueMin != null && candidate < this.valueMin) {
            this.jumpRejectStreak = 0;
            return {
                value: this.lastPublishedValue !== undefined ? this.lastPublishedValue : candidate,
                accepted: false,
                reason: 'below_min',
            };
        }
        if (this.valueMax != null && candidate > this.valueMax) {
            this.jumpRejectStreak = 0;
            return {
                value: this.lastPublishedValue !== undefined ? this.lastPublishedValue : candidate,
                accepted: false,
                reason: 'above_max',
            };
        }

        if (this.maxJump != null && this.lastPublishedValue !== undefined) {
            const delta = Math.abs(candidate - this.lastPublishedValue);
            if (delta > this.maxJump) {
                this.jumpRejectStreak += 1;
                if (this.jumpRejectStreak >= this.maxJumpStreak) {
                    // Sustained step change → adopt new baseline
                    this.jumpRejectStreak = 0;
                    return {
                        value: candidate,
                        accepted: true,
                        reason: 'max_jump_accepted',
                    };
                }
                return {
                    value: this.lastPublishedValue,
                    accepted: false,
                    reason: 'max_jump',
                };
            }
        }

        this.jumpRejectStreak = 0;
        return { value: candidate, accepted: true, reason: null };
    }

    handleChange(j5Value) {
        const instantRaw = j5Value;
        const filteredRaw = this.applySampleWindow(instantRaw);

        // engineering: post-window, post-calibration (or raw if no curve)
        let calibrated;
        try {
            calibrated = this.applyCalibration(filteredRaw);
        } catch (err) {
            console.error(err);
            debug(`calibration error on ${this.sensorConfig.name}: ${err && err.message ? err.message : err}`);
            return;
        }

        const guarded = this.applyValueGuards(calibrated);

        // Only accepted readings establish / update the stable baseline
        if (guarded.accepted && guarded.value !== undefined && !Number.isNaN(guarded.value)) {
            this.lastPublishedValue = guarded.value;
        }

        // Publish last good value when rejecting; if none yet, still expose calibrated once
        // so the entity is not stuck empty at startup (attributes show accepted=false).
        let publishValue = this.lastPublishedValue;
        if (publishValue === undefined) {
            publishValue = calibrated;
        }

        const attributes = {
            raw_value: instantRaw,
            filtered_raw: filteredRaw,
            calibrated: calibrated,
            accepted: guarded.accepted,
            reject_reason: guarded.reason,
            jump_streak: this.jumpRejectStreak,
        };
        if (this.calibrationType === 'dfrobot_orp' && this.dfrobotOffset !== undefined) {
            attributes.dfrobot_offset = this.dfrobotOffset;
        }

        const sensorData = {
            value: publishValue,
            attributes,
        };

        debug(`Brut ${instantRaw} filtered_raw ${filteredRaw} on ${this.sensorConfig.name} -> ${sensorData.value}` +
            (guarded.reason ? ` [${guarded.reason} cal=${calibrated}]` : ''));

        if (sensorData.value != undefined && !Number.isNaN(sensorData.value)) {
            this.mqttClient.publish(this.stateTopic, JSON.stringify(sensorData), { retain: true });
        } else {
            console.log("ATTENTION");
            debug(`ATTENTION ${this.sensorConfig.name} changed value is undefined`);
        }
    }

}

module.exports = MQTTSensor;
module.exports.dfrobotOrpRaw = dfrobotOrpRaw;
module.exports.computeDfrobotOffset = computeDfrobotOffset;
