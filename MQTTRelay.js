const { Relay } = require('johnny-five');
const util = require('./util.js')
const debug = require('debug')('MQTTRelay');

const SLUG = "j5_ha_bridge";

class MQTTRelay extends Relay {
    constructor(options, mqttManager, addonConfig, itemConfig) {
        let unique_id = `j5_relay_${util.convertWith_(itemConfig.name)}_on_pin_${itemConfig.pin}`;
        let commandTopic = `${SLUG}/relay/${unique_id}/set`;
        options = {
            ...options,
            custom: {
                command_topic: `${commandTopic}`,
                unique_id: `${unique_id}`  // Assuming pin is unique for each relay
            }
        }
        super(options);
        this.addonConfig = addonConfig;
        this.itemConfig = itemConfig;

        this.stateOFF = this.addonConfig.state_off || "OFF";
        this.stateON = this.addonConfig.state_on || "ON";

        this.state = "UNKNOWN";
        debug(`Initialisation du relay ${this.name} à l'etat: ${this.state} (${this.value} [${this.type}])`);
        this.retainCommand = this.itemConfig.retain || true;           // should the state msg be retained

        this.optimistic = this.itemConfig.optimistic || false;       // we prefer the non optimistic bahaviour
        this.stateTopic = `${SLUG}/relay/${this.custom.unique_id}/state`;



        this.mqttClient = mqttManager.mqttClient;
        this.mqttConfig = mqttManager.mqttConfig;

        this.domain = itemConfig.domain || "switch";
        this.commandTopic = commandTopic;
        // Announce the relay to MQTT Home Assistant discovery
        this.announce();

        // Listen for 'change' event and update MQTT state
        /*this.on("change", () => {
            this.updateState(this.isOn ? 'ON' : 'OFF');
        });*/


        debug(`subscribing command topic ${this.commandTopic}`);
        // Subscribe to MQTT command topic
        this.mqttClient.subscribe(this.commandTopic, (topic, message) => {
            debug(`received command ack`);
        });

        this.mqttClient.on('message', (topic, message) => {
            if (topic === this.commandTopic) {
                const command = message.toString();
                debug(`received command ${command} for on topic ${topic}`);
                if (command === 'ON') {
                    this.close();
                } else if (command === 'OFF') {
                    this.open();
                }
                this.updateState(command);
            } else if (topic === this.stateTopic) {
                // Je pense que mon composant n'a pas besoin d'écouter l'Etat puisqu'il est le référent de l'Etat du device.
                // this.updateState(message.toString());
            }
        });
    }

    defaultInitState(state = 0) {
        if (this.type === "NC") {
            return (state ? this.stateOFF : this.stateON);
        } else { // default to NO if type is not specified
            return (state ? this.stateON : this.stateOFF);
        }
    }

    initializeState() {
        this.state = this.defaultInitState(0);
    }

    announce() {
        let jsonRelayConfig = {
            unique_id: this.custom.unique_id,
            name: this.itemConfig.name,
            device_class: this.itemConfig.device_class,
            state_topic: this.stateTopic,
            //value_template: '{{ value_json.state }}',
            command_topic: `${this.custom.command_topic}`,
            payload_on: this.stateON,
            payload_off: this.stateOFF,
            state_on: this.stateON,
            state_off: this.stateOFF,
            retain: this.retainCommand,
            optimistic: this.optimistic,
            device: {
                name: this.itemConfig.name,
                identifiers: this.custom.unique_id,
                model: this.controller,
                manufacturer: SLUG
            }
        }
        debug(`config topic: ${this.addonConfig.discovery_topic}/${this.domain}/${this.custom.unique_id}/config`)
        debug(`Will publish config MQTT for discovery: ${SLUG} ${JSON.stringify(jsonRelayConfig, null, 2)}`)
        this.mqttClient.publish(`${this.addonConfig.discovery_topic}/${this.domain}/${this.custom.unique_id}/config`, JSON.stringify(jsonRelayConfig), { retain: true });
    }

    updateState(state) {

        if (this.state !== state) {
            this.state = state;
            //setTimeout(() => {
            debug(`publishing topic: ${this.stateTopic} with payload: ${state}`);
            this.mqttClient.publish(this.stateTopic, state, { qos: 1, retain: true }, (err) => {
                if (err) debug(`Error publishing state: ${err}`);
            });
            //}, 3000);


        }

        //this.mqttClient.publish(this.stateTopic, state);
    }


}

module.exports = MQTTRelay;
