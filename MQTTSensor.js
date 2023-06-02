const { Sensor } = require('johnny-five');
const util = require('./util.js');
const { Console } = require('console');
const debug = require('debug')('MQTTSensor');
const info = require('debug')('infos');
const SLUG = "j5_ha_bridge";
const everpolate = require('everpolate');
const regression = require('regression');

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

        // Generate a unique MQTT topic for this sensor
        this.stateTopic = `${SLUG}/sensor/${this.unique_id}`;

        this.announce();
        // Subscribe to the sensor's change event
        this.on('change', this.handleChange.bind(this));
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
                        if (!this.calibration.x_points) { this.calibration.x_points = []; };
                        if (!this.calibration.y_points) { this.calibration.y_points = []; };
                        if (!this.calibration.data_points) { this.calibration.data_points = []; };
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
            //value_template: '{{ value_json.temperature }}',
            device: {
                name: this.sensorConfig.name,
                identifiers: this.unique_id,
                manufacturer: SLUG
            }
        }
        debug(`config topic: ${this.addonConfig.discovery_topic}/sensor/${this.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonSensorConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonConfig.discovery_topic}/sensor/${this.unique_id}/config`, JSON.stringify(jsonSensorConfig), { retain: true });

    }
    handleChange() {

        let sensorData = this.value;

        if (this.calibration) {
            if (!this.regression) {
                this.regression = regression[this.calibrationType](this.calibration.data_points,
                    { order: this.calibrationOrder, precision: this.calibrationPrecision });
                info(`regression  : ${this.calibrationType}`);
                info(`${this.regression.string}`);
                info(`r2 : ${this.regression.r2}`);

            }
            sensorData = this.regression.predict(sensorData)[1];
        }

        /*if (this.addonConfig.scale_min && this.addonConfig.scale_max) {
            sensorData = this.scaleTo(this.addonConfig.scale_min, this.addonConfig.scale_max);  // Scale the sensor's data from 0-1023 to 0-100
        }*/


        debug(`Brut data ${this.value} on ${this.sensorConfig.name} -> ${sensorData}`);
        // Publish the new sensor data to MQTT
        if (sensorData != undefined) {
            this.mqttClient.publish(this.stateTopic, sensorData.toString());
        } else {
            console.log("ATTENTION");
            debug(`ATTENTION ${this.sensorConfig.name} changed value: ${sensorData}`);
        }
    }
}

module.exports = MQTTSensor;
