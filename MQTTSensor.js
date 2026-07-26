const { Sensor } = require('johnny-five');
const util = require('./util.js');
const debug = require('debug')('MQTTSensor');
const info = require('debug')('infos');
const SLUG = "j5_ha_bridge";
const regression = require('regression');

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
        this.valueMin = sensorConfig.value_min != null && sensorConfig.value_min !== ''
            ? Number(sensorConfig.value_min)
            : null;
        this.valueMax = sensorConfig.value_max != null && sensorConfig.value_max !== ''
            ? Number(sensorConfig.value_max)
            : null;

        this.lastPublishedValue = undefined;

        if (this.filterSamples > 1 || this.maxJump != null || this.valueMin != null || this.valueMax != null) {
            info(`${sensorConfig.name} filter: samples=${this.filterSamples}` +
                `${this.maxJump != null ? ` max_jump=${this.maxJump}` : ''}` +
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
                        // this one is for regression lib
                        this.calibration.data_points.push([point.x_point, point.y_point]);
                    }
                });
            }
            if (!this.calibration.x_points) {
                this.emit("error",
                    new Error('Configuration Error: You have to provide a calibration_set with points and "set" set corresponding set'));
            }


        }
    }

    announce() {
        let jsonSensorConfig = {
            unique_id: `${this.unique_id}`,
            name: this.sensorConfig.name,
            device_class: this.sensorConfig.device_class,
            state_topic: this.stateTopic,
            unit_of_measurement: this.sensorConfig.unit,
            value_template: '{{ value_json.value }}', // Extrait la valeur de l'état du JSON
            json_attributes_topic: this.stateTopic, // Gardez la même rubrique pour les attributs
            json_attributes_template: '{{ value_json.attributes | tojson }}', // Extrait les attributs
            device: {
                name: this.sensorConfig.name,
                identifiers: this.unique_id,
                manufacturer: SLUG
            }
        }

        if (this.state_class) {
            jsonSensorConfig.state_class = this.state_class;
        }

        debug(`config topic: ${this.addonConfig.discovery_topic}/sensor/${this.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonSensorConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonConfig.discovery_topic}/sensor/${this.unique_id}/config`, JSON.stringify(jsonSensorConfig), { retain: true });
    }

    /**
     * Apply optional sliding median on successive Johnny-Five readings (already median-filtered per interval).
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
        // Need a full window before trusting the median (avoids cold-start bias)
        if (this.rawWindow.length < this.filterSamples) {
            return medianOf(this.rawWindow);
        }
        return medianOf(this.rawWindow);
    }

    /**
     * After calibration: reject absurd jumps / out-of-range values (keep last good).
     * @param {number} candidate
     * @returns {{ value: number, accepted: boolean, reason: string|null }}
     */
    applyValueGuards(candidate) {
        if (candidate == null || Number.isNaN(candidate)) {
            return {
                value: this.lastPublishedValue,
                accepted: false,
                reason: 'nan',
            };
        }

        if (this.valueMin != null && candidate < this.valueMin) {
            return {
                value: this.lastPublishedValue !== undefined ? this.lastPublishedValue : candidate,
                accepted: false,
                reason: 'below_min',
            };
        }
        if (this.valueMax != null && candidate > this.valueMax) {
            return {
                value: this.lastPublishedValue !== undefined ? this.lastPublishedValue : candidate,
                accepted: false,
                reason: 'above_max',
            };
        }

        if (this.maxJump != null && this.lastPublishedValue !== undefined) {
            const delta = Math.abs(candidate - this.lastPublishedValue);
            if (delta > this.maxJump) {
                return {
                    value: this.lastPublishedValue,
                    accepted: false,
                    reason: 'max_jump',
                };
            }
        }

        return { value: candidate, accepted: true, reason: null };
    }

    handleChange(j5Value) {
        const instantRaw = j5Value;
        const filteredRaw = this.applySampleWindow(instantRaw);

        let calibrated = filteredRaw;
        if (this.calibration) {
            if (!this.regression) {
                this.regression = regression[this.calibrationType](this.calibration.data_points,
                    { order: this.calibrationOrder, precision: this.calibrationPrecision });

                info(`${this.sensorConfig.name} sensor is calibrated using regression  : ${this.calibrationType}`);
                info(`${this.regression.string}`);
                info(`r2 : ${this.regression.r2}`);
            }
            calibrated = this.regression.predict(filteredRaw)[1];
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

        const sensorData = {
            value: publishValue,
            attributes: {
                raw_value: instantRaw,
                filtered_raw: filteredRaw,
                calibrated: calibrated,
                accepted: guarded.accepted,
                reject_reason: guarded.reason,
            },
        };

        debug(`Brut ${instantRaw} filtered_raw ${filteredRaw} on ${this.sensorConfig.name} -> ${sensorData.value}` +
            (guarded.reason ? ` [rejected:${guarded.reason} cal=${calibrated}]` : ''));

        if (sensorData.value != undefined && !Number.isNaN(sensorData.value)) {
            this.mqttClient.publish(this.stateTopic, JSON.stringify(sensorData), { retain: true });
        } else {
            console.log("ATTENTION");
            debug(`ATTENTION ${this.sensorConfig.name} changed value is undefined`);
        }
    }

}

module.exports = MQTTSensor;
