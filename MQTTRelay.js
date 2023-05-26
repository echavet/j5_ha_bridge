const { Relay } = require('johnny-five');
const debug = require('debug')('MQTTRelay');

const SLUG = "j5_ha_bridge";

class MQTTRelay extends Relay {
    constructor(options, mqttManager, addonconfig, itemConfig) {
        super(options);
        this.addonconfig = addonconfig;
        this.itemConfig = itemConfig;
        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;
        this.stateTopic = `${SLUG}/relay/${this.custom.unique_id}/state`;
        // Announce the relay to MQTT Home Assistant discovery
        this.announce();

        // Listen for 'change' event and update MQTT state
        /*this.on("change", () => {
            this.updateState(this.isOn ? 'ON' : 'OFF');
        });*/
    }

    announce() {
        let jsonRelayConfig = {
            unique_id: this.custom.unique_id,
            name: this.itemConfig.name,
            device_class: this.itemConfig.device_class,
            //state_topic: this.stateTopic,
            //value_template: '{{ value_json.state }}',
            command_topic: `${this.custom.command_topic}`,
            payload_on: 'ON',
            payload_off: 'OFF',
            device: {
                name: this.itemConfig.name,
                identifiers: this.custom.unique_id,
                model: this.controller,
                manufacturer: SLUG
            }
        }
        debug(`config topic: ${this.addonconfig.discovery_topic}/switch/${this.custom.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonRelayConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonconfig.discovery_topic}/switch/${this.custom.unique_id}/config`, JSON.stringify(jsonRelayConfig), { retain: true });
    }

    updateState(state) {
        this.mqttClient.publish(this.stateTopic, state);
    }
}

module.exports = MQTTRelay;
