const { Sensor } = require('johnny-five');
const debug = require('debug')('mqtt-sensor');
const SLUG = "j5_ha_bridge";

class MQTTSensor extends Sensor {
    constructor(options, mqttManager, addonConfig, sensorConfig) {
        super(options);

        this.mqttManager = mqttManager;
        this.addonConfig = addonConfig;
        this.sensorConfig = sensorConfig;


        // Generate a unique MQTT topic for this sensor
        this.topic = `${SLUG}/sensor/${this.sensorConfig.name}`;

        // Subscribe to the sensor's change event
        this.on('change', this.handleChange.bind(this));
    }

    handleChange() {

        let sensorData = this.value;

        if (this.addonConfig.scale_min && this.addonConfig.scale_max) {
            sensorData = this.scaleTo(this.addonConfig.scale_min, this.addonConfig.scale_max);  // Scale the sensor's data from 0-1023 to 0-100
        }

        debug(`Sensor ${this.sensorConfig.name} changed value: ${sensorData}`);

        // Publish the new sensor data to MQTT
        this.mqttManager.mqttClient.publish(this.topic, String(sensorData));
    }
}

module.exports = MQTTSensor;
