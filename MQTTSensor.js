const { Sensor } = require('johnny-five');
const util = require('./util.js');
const { Console } = require('console');
const debug = require('debug')('MQTTSensor');
const SLUG = "j5_ha_bridge";
const everpolate = require('everpolate');
//const regression = require('regression');

class MQTTSensor extends Sensor {
    constructor(options, mqttManager, addonConfig, sensorConfig) {
        super(options);

        this.mqttManager = mqttManager;
        this.addonConfig = addonConfig;
        this.sensorConfig = sensorConfig;
        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;
        this.unique_id = `${util.convertWith_(this.sensorConfig.name)}_on_pin_${this.sensorConfig.pin}`;
        this.calibration = sensorConfig.calibration;
        // Generate a unique MQTT topic for this sensor
        this.stateTopic = `${SLUG}/sensor/${this.unique_id}`;

        this.announce();
        // Subscribe to the sensor's change event
        this.on('change', this.handleChange.bind(this));
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

        debug(`Brut data on ${this.name} ${this.value}`);

        let sensorData = this.value;

        if (this.calibration) {
            this.calibration.x_points = [];
            this.calibration.y_points = [];
            this.calibration.forEach(point => {
                this.calibration.x_points.push(point.x_point);
                this.calibration.y_points.push(point.y_point);
            });
            if (!this.regression) {
                this.regression =
                    everpolate.linearRegression(this.calibration.x_points, this.calibration.y_points);
            }

            debug(`Interpolation of  ${this.value} -> is `);
            sensorData = this.regression.evaluate(sensorData);
            debug(`Interpolation of  ${this.value} -> is ${sensorData}`);
        }

        /*if (this.addonConfig.scale_min && this.addonConfig.scale_max) {
            sensorData = this.scaleTo(this.addonConfig.scale_min, this.addonConfig.scale_max);  // Scale the sensor's data from 0-1023 to 0-100
        }*/

        debug(`Sensor ${this.sensorConfig.name} changed value: ${sensorData}`);

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
