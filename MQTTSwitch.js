const { Switch } = require('johnny-five');
const debug = require('debug')('MQTTSwitch')

const SLUG = "j5_ha_bridge";

class MQTTSwitch extends Switch {
    constructor(options, mqttManager, addonConfig, itemConfig) {
        super(options);
        this.addonConfig = addonConfig;
        this.itemConfig = itemConfig;
        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;
        //this.stateTopic = `${SLUG}/${itemConfig.device_class}/${this.custom.unique_id}/state`;
        this.stateTopic = `${SLUG}/binary_sensor/${this.custom.unique_id}/state`;
        // Announce the switch to MQTT Home Assistant discovery
        this.announce();

        // Listen for 'open' event and update MQTT state
        this.on("open", () => {
            this.updateState('OFF');
        });

        // Listen for 'close' event and update MQTT state
        this.on("close", () => {
            this.updateState('ON');
        });
    }

    announce() {
        let jsonSwitchConfig = {
            unique_id: this.custom.unique_id,
            name: this.itemConfig.name,
            device_class: this.itemConfig.device_class,
            state_topic: this.stateTopic,
            device: {
                name: this.itemConfig.name,
                identifiers: this.custom.unique_id,
                model: this.controller,
                manufacturer: SLUG
            }
        }
        debug(`config topic: ${this.addonConfig.discovery_topic}/binary_sensor/${this.custom.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonSwitchConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonConfig.discovery_topic}/binary_sensor/${this.custom.unique_id}/config`, JSON.stringify(jsonSwitchConfig), { retain: true });
    }

    updateState(state) {
        this.mqttClient.publish(this.stateTopic, state, { retain: true });        
    }
}
module.exports = MQTTSwitch;
