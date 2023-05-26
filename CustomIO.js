const { Board } = require('firmata');
const SerialPort = require('serialport');
const debug = require('debug')('CustomIO')

const SENSOR_THERMOMETER_DS18B20_AUTO = "AUTO-DS18B20";
const SENSOR_THERMOMETER_DS18B20 = "DS18B20";
const SENSOR = "sensor";

const ADDON_NAME = "local_j5_ha_bridge";
const SLUG = "j5_ha_bridge";

const MQTTThermometer = require('./MQTTThermometer');
const MQTTRelay = require('./MQTTRelay');
const MQTTSensor = require('./MQTTSensor');
const util = require('./util.js')

/**
 * Class permettant de surcharger l'initialisation par défaut avec une baudrate adapté au Firmware installé sur l'arduino
 */
class CustomIO extends Board {

    constructor(config, options = {}, callback) {
        //const customBaudRate = util.CONFIGURABLE_FIRMATA_BAUD_RATE; // Remplacez par le baudrate souhaité

        let port = config.device;
        let baudrate = parseInt(config.baudrate);

        debug("Connection...", `port ${port}, baudrate ${baudrate}`);

        const serialPort = new SerialPort(port, { baudRate: baudrate });
        super(serialPort, options, callback);

        this.switches = config.switches;
        this.relays = config.relays;
        this.sensors = config.sensors;
        this.thermometers = config.thermometers;
        this.addonConfig = config;
        console.log(config);
    }


    setupEntities(mqttManager, addonConfig) {
        this.addonConfig = addonConfig;
        this.mqttManager = mqttManager;
        //mqttManager.setConfig(this.addonConfig);
        this.switches.map(switchItem => {
            //switchItem.device_class = switchItem.device_class || "binary_sensor";
            this.configureSwitch(switchItem);
        });

        this.relays.map(relayItem => {
            this.configureRelay(relayItem);
        });

        this.sensors.map(sensorItem => {
            this.configureSensor(sensorItem);
        });
        this.thermometers.map(thermometerItem => {
            thermometerItem.device_class = thermometerItem.device_class || "temperature";
            thermometerItem.unit = thermometerItem.unit || "°C";
            this.configureThermometer(thermometerItem);
        });
    }
    configureSensor(sensorConfig) {
        debug("found sensor:");
        debug(`name ${sensorConfig.name}`);
        debug(`pin ${sensorConfig.pin}`);

        // Create an MQTTSensor
        let sensor = new MQTTSensor({
            pin: sensorConfig.pin,
            freq: sensorConfig.freq,
            threshold: sensorConfig.threshold,
        }, this.mqttManager, this.addonConfig, sensorConfig);

        debug(`configured sensor ${sensorConfig.name}`);
    }


    configureThermometer(thermometerItem) {
        debug("found Thermometer:");
        debug(`name ${thermometerItem.name}`);
        debug(`pin ${thermometerItem.pin}`);
        debug(`controler ${thermometerItem.controler}`);
        debug(`unit ${thermometerItem.unit}`);
        debug(`class ${thermometerItem.device_class}`);
        debug(`address ${thermometerItem.address}`);

        if (thermometerItem.controler == SENSOR_THERMOMETER_DS18B20_AUTO) {
            // recherche des thermomètres connectés en onewire
            this.configureOneWireAutoThermometer(thermometerItem);

        } else {
            if ((sensorItem.address == null) || (sensorItem.address == undefined)) {
                debug("Address not provided for thermoter");
                this.configureClassicThermometer(thermometerItem);
            } else {
                let options = {
                    address: thermometerItem.address
                }
                this.configureClassicThermometer(thermometerItem, options);
            }
        }
    }

    configureClassicThermometer(thermometerItem, options) {
        return new MQTTThermometer({
            custom: {
                unique_id: thermometerItem.address
            },
            ...options,
            controller: thermometerItem.controler,
            pin: thermometerItem.pin,
            freq: 1000
        }, this.mqttManager, this.addonConfig, thermometerItem);
    }

    configureOneWireAutoThermometer(thermometerItem) {
        this.sendOneWireConfig(thermometerItem.pin, true);
        this.sendOneWireSearch(thermometerItem.pin, (err, devices) => {
            if (err) {
                debug("DS18B20:initialize", `error occured (${err}`);
                util.handleError(err);
                return;
            }

            if (devices.length === 0) {
                debug("DS18B20: FAILED TO FIND TEMPERATURE DEVICE");
                return;
            }


            devices.forEach(device => {
                const address = util.getAddress(device);
                debug("DS18B20:initialize", `found sensor (${address})`);
                const t = new MQTTThermometer({
                    custom: {
                        unique_id: address
                    },
                    controller: "DS18B20",
                    pin: thermometerItem.pin,
                    address: address,
                    freq: 1000
                }, this.mqttManager, this.addonConfig, thermometerItem);

            });
        });
    }

    /**
 * Creates an MQTTRelay that extends the Relay class from johnny-five
 * @param {*} relayItem 
 */
    configureRelay(relayItem) {
        debug("found relay:");
        debug(`name ${relayItem.name}`);
        debug(`pin ${relayItem.pin}`);
        let unique_id = `j5_relay_on_pin_${relayItem.pin}`;
        let commandTopic = `${SLUG}/relay/${unique_id}/set`;
        // Create an MQTTRelay
        let relay = new MQTTRelay({
            pin: relayItem.pin,
            type: relayItem.type,
            custom: {
                command_topic: `${commandTopic}`,
                unique_id: `${unique_id}`  // Assuming pin is unique for each relay
            }
        }, this.mqttManager, this.addonConfig, relayItem);

        debug(`subscribing command topic ${commandTopic}`);
        // Subscribe to MQTT command topic
        this.mqttManager.mqttClient.subscribe(commandTopic, (topic, message) => {
            debug(`received command ack`);
        });

        this.mqttManager.mqttClient.on('message', (topic, message) => {
            if (topic === commandTopic) {
                const command = message.toString();
                debug(`received command ${command} for on topic ${topic}`);
                if (command === 'ON') {
                    relay.close();
                } else if (command === 'OFF') {
                    relay.open();
                }
            }
        });

    }

    /**
     * Fabrique un MQTTSwitch qui surcharge la classe Switch de johnny-five
     * @param {*} switchItem 
     */
    configureSwitch(switchItem) {
        debug("found switch:");
        debug(`name ${switchItem.name}`);
        debug(`pin ${switchItem.pin}`);
        let unique_id = `j5_switch_on_pin_${switchItem.pin}`;

        // Create an MQTTSwitch
        let switchObj = new MQTTSwitch({
            pin: switchItem.pin,
            custom: {
                unique_id: `${unique_id}`  // Assuming pin is unique for each switch
            }
        }, this.mqttManager, this.addonConfig, switchItem);
    }


}

module.exports = CustomIO;
