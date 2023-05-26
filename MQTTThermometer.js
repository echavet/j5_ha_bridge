const { MqttClient } = require('mqtt');
const { Thermometer } = require('johnny-five');
const debug = require('debug')('MQTTThermometer')
const tracker = require('./DataTracker');

const SLUG = "j5_ha_bridge";


class MQTTThermometer extends Thermometer {
    constructor(options, mqttManager, addonconfig, itemConfig) {
        super(options);
        this.addonconfig = addonconfig;
        this.itemConfig = itemConfig;
        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;
        this.stateTopic = `${SLUG}/${itemConfig.device_class}/${this.custom.unique_id}/state`;
        this.lastCelsius = -255;
        tracker.addVariable(this.custom.unique_id, 8);     // moyennes des 8 dernières mesures        
        // Announce the thermometer to MQTT Home Assistant discovery
        this.announce();

        // Subscribe to MQTT command topic and handle commands
        /*if (typeof this.handleCommand === 'function') {
            this.mqttClient.subscribe(`${SLUG}/${this.mqttConfig.device_class}/${this.mqttConfig.id}/set`, this.handleCommand);
        }*/

        // Listen for 'change' event and update MQTT state
        this.on("change", () => {

            tracker.push(this.custom.unique_id, this.celsius);

            let celsius = tracker.getAverage(this.custom.unique_id);

            if (celsius !== null && celsius !== undefined) {
                celsius = parseFloat(celsius.toFixed(2)); // Arrondi à 1 chiffre après la virgule
                if (celsius != this.lastCelsius) {
                    this.updateState(celsius);
                    this.lastCelsius = celsius;
                }
            }
        });

    }

    announce() {
        let jsonThermometerConfig = {
            unique_id: this.custom.unique_id,
            name: this.itemConfig.name,
            device_class: this.itemConfig.device_class,
            state_topic: this.stateTopic,
            unit_of_measurement: this.itemConfig.unit,
            //value_template: '{{ value_json.temperature }}',
            device: {
                name: this.itemConfig.name,
                identifiers: this.custom.unique_id,
                model: this.controller,
                manufacturer: SLUG
            }
        }
        debug(`config topic: ${this.addonconfig.discovery_topic}/sensor/${this.custom.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonThermometerConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonconfig.discovery_topic}/sensor/${this.custom.unique_id}/config`, JSON.stringify(jsonThermometerConfig), { retain: true });

    }

    updateState(celsius) {
        this.mqttClient.publish(`${SLUG}/${this.itemConfig.device_class}/${this.custom.unique_id}/state`, celsius.toString());
    }

}
module.exports = MQTTThermometer;