
//const { Thermometer } = require('johnny-five');
const { MqttClient } = require('mqtt');

const debug = require('debug')('MQTTManager')

//const SLUG = "j5_ha_bridge";
//const DISCOVERY_TOPIC = "homeassistant";

class MQTTManager {

    /**
      * @type {MqttClient}
      */
    mqttClient;
    mqttConfig;

    constructor(mqttClient, mqttConfig) {
        this.mqttClient = mqttClient;
        this.mqttConfig = mqttConfig;
    }
    /*
    createProxy(device, config) {
        let mqttMethods;

        if (device instanceof Thermometer) {
            let state_topic = `${SLUG}/${config.device_class}/${device.custom.unique_id}/state`;
            mqttMethods = {
                announce: (entity) => {
                    // Announce the thermometer to MQTT Home Assistant discovery here

                    debug(`MQTT announce: NEW THERMOMETER: ${entity.custom.unique_id}`);

                    let jsonThermometerConfig = {
                        unique_id: entity.custom.unique_id,
                        name: config.name,
                        device_class: config.device_class,
                        state_topic: state_topic,
                        unit_of_measurement: config.unit,
                        value_template: '{{ value_json.temperature }}',
                        device: {
                            name: config.name,
                            identifiers: entity.custom.unique_id,
                            model: entity.controller,
                            manufacturer: SLUG
                        }
                    }
                    // TODO: publier en mode retain
                    this.#mqttClient.publish(`${this.#mqttConfig.discovery_topic}/sensor/${entity.custom.unique_id}/config`, JSON.stringify(jsonThermometerConfig));
                },
                updateState: (entity) => {
                    debug(`MQTT thermometer state: ${entity.celsius}`);
                    // Send the updated temperature to the MQTT broker
                    this.#mqttClient.publish(`${SLUG}/${config.device_class}/${entity.custom.unique_id}/state`, entity.celsius.toString());
                },
            
            };
        } else if (device instanceof Sensor) {
            mqttMethods = {
                // Define MQTT methods for the Sensor class here
                announce: () => {
                    // Announce the thermometer to MQTT Home Assistant discovery here
                    debug("MQTT announce: NEW SENSOR");
                },
                updateState: (state) => {
                    debug(`MQTT thermometer state: ${state}`);
                    // Send the updated temperature to the MQTT broker
                    //this.mqttClient.publish(`${MQTT_BASE_TOPIC}/sensors/data`, state.toString());
                },
                handleCommand: (command) => {
                    // Handle MQTT commands for the thermometer here
                    debug(`MQTT sensor command: ${command}`);
                },
            };
        } // Add more conditions for other Johnny-Five classes

        return this.createMQTTProxy(device, mqttMethods, config);
    }
    */
    /*
    createMQTTProxy(target, mqttMethods, config) {
        const handler = {
            get(target, prop, receiver) {
                //debug(`proxy interception: ${target}, ${prop}, ${receiver}`);
                if (prop === 'on' || prop === 'addListener') {
                    // Intercept the "on" and "addListener" methods
                    return function (event, listener) {
                        // Call the original method
                        const result = Reflect.get(target, prop, receiver).call(target, event, listener);

                        // Call the appropriate MQTT method based on the event
                        if (event === 'change' && typeof mqttMethods.updateState === 'function') {
                            mqttMethods.updateState(target);
                        }

                        return result;
                    };
                }

                return Reflect.get(target, prop, receiver);
            },
        };

        const proxy = new Proxy(target, handler);

        // Announce the device to MQTT Home Assistant discovery
        if (typeof mqttMethods.announce === 'function') {
            mqttMethods.announce(target);
        }

        // Listen for MQTT commands if the handleCommand method is defined
        if (typeof mqttMethods.handleCommand === 'function') {
            // Subscribe to MQTT command topic and handle commands
            this.#mqttClient.subscribe(`${SLUG}/${config.device_class}/${config.id}/set`, mqttMethods.handleCommand);
        }

        return proxy;
    }*/
    /*
    createMQTTProxy(target, mqttMethods, config) {
        const proxy = Object.create(target);

        // Override the 'on' and 'addListener' methods
        proxy.on = proxy.addListener = function (event, listener) {
            if (event === 'change' && typeof mqttMethods.updateState === 'function') {
                // Wrap the listener in a function that calls updateState
                const wrappedListener = function () {
                    mqttMethods.updateState(target);
                    listener.apply(target, arguments); // change 'this' inside listener to target
                };
                target.on(event, wrappedListener.bind(target)); // change 'this' inside on to target
            } else {
                target.on(event, listener.bind(target)); // change 'this' inside on to target
            }
        };


        // Announce the device to MQTT Home Assistant discovery
        if (typeof mqttMethods.announce === 'function') {
            mqttMethods.announce(target);
        }

        // Listen for MQTT commands if the handleCommand method is defined
        if (typeof mqttMethods.handleCommand === 'function') {
            // Subscribe to MQTT command topic and handle commands
            this.#mqttClient.subscribe(`${SLUG}/${config.device_class}/${config.id}/set`, mqttMethods.handleCommand);
        }

        return proxy;
    }*/
}
module.exports = MQTTManager;