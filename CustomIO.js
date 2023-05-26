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
const MQTTSwitch = require('./MQTTSwitch');
const util = require('./util.js')

/**
 * Class permettant de surcharger l'initialisation par défaut avec une baudrate adapté au Firmware installé sur l'arduino
 */
class CustomIO extends Board {
    // TODO: garder chaque entité en mémoire et écouter les évènements board.on('error' et board.on('disconneted'
    // afin de publier des unavailable et des available lorsque que la connexion est rétablie
    constructor(config, mqttManager, options = {}, callback) {
        //const customBaudRate = util.CONFIGURABLE_FIRMATA_BAUD_RATE; // Remplacez par le baudrate souhaité        
        let port = config.device;
        let baudrate = parseInt(config.baudrate);
        debug("Connection...", `port ${port}, baudrate ${baudrate}`);
        let spConfig = {
            ...options,
            baudRate: baudrate,
            serialport: {
                baudRate: baudrate,
                highWaterMark: 256,
            }
        };
        const serialPort = new SerialPort(port, spConfig);

        super(serialPort, spConfig, callback);

        this.mqttManager = mqttManager;
        this.mqttRelays = [];

        config.switches = config.binary_sensors;    // switches in j5 are binary_sensors in ha

        this.switches = config.binary_sensors;        // binary_sensors
        this.relays = config.relays;
        this.sensors = config.sensors;
        this.thermometers = config.thermometers;

        this.addonConfig = config;
        //console.log(config);

        this.on('error', (error) => {
            util.handleError(error);
        });


        this.on('string', (message) => {
            debug('STRING: ', `${message}`);
        });

        this.on('ready', () => {
            debug("La carte Arduino est prête.");
            // lecture des objets dans la config de l'addon et annonce mqtt si nécessaire.
            this.setupEntities(this.mqttManager, this.addonConfig);

            // Now that the board is ready, we can start to listen to the reboot message

            this.on('string', (message) => {
                if (message.startsWith("Booting device.")) {
                    debug("déconnexion détecté de la board");
                    this.mqttRelays.forEach(relay => {
                        relay.updateState(relay.defaultInitState());
                    });
                    console.log("La board a été redémarrée. L'addon doit s'arrêter.");
                    console.log('Il est conseillé d\'activer l\'option "chien de garde" dans la configuration de l\'addon si vous souhatez pouvoir rebooter la board.');
                    process.exit(1);
                }
            });

        });


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
            this.mqttRelays.push(this.configureRelay(relayItem));
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
        debug(`found sensor named ${sensorConfig.name} on pin ${sensorConfig.pin}`);
        // Create an MQTTSensor
        let sensor = new MQTTSensor({
            ...sensorConfig,
            /*pin: sensorConfig.pin,
            freq: sensorConfig.freq,
            threshold: sensorConfig.threshold,*/
        }, this.mqttManager, this.addonConfig, sensorConfig);
        //debug(`configured sensor ${sensorConfig.name}`);
    }


    configureThermometer(thermometerItem) {
        debug("found Thermometer:");
        debug(`found Thermometer ${thermometerItem.address} named ${thermometerItem.name} pin ${thermometerItem.pin} controler ${thermometerItem.controler}`);
        //debug(`unit ${thermometerItem.unit}`);
        //debug(`class ${thermometerItem.device_class}`);
        //debug(`address ${thermometerItem.address}`);

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
            controller: thermometerItem.controler,
            pin: thermometerItem.pin,
            ...options,
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
                    freq: thermometerItem.freq || 1000      // should not be > 5000 because the timeout would occur
                }, this.mqttManager, this.addonConfig, thermometerItem);

            });
        });
    }

    /**
 * Creates an MQTTRelay that extends the Relay class from johnny-five
 * @param {*} relayConfig 
 */
    configureRelay(relayConfig) {
        debug(`found relay: name ${relayConfig.name} pin ${relayConfig.pin}`);
        //let unique_id = `j5_relay_on_pin_${relayItem.pin}`;
        /*let unique_id = `j5_relay_${util.convertWith_(relayConfig.name)}_on_pin_${relayConfig.pin}`;
        let commandTopic = `${SLUG}/relay/${unique_id}/set`;*/
        // Create a MQTTRelay
        return new MQTTRelay(relayConfig, this.mqttManager, this.addonConfig, relayConfig);
    }

    /**
     * Fabrique un MQTTSwitch qui surcharge la classe Switch de johnny-five
     * @param {*} switchConfig 
     */
    configureSwitch(switchConfig) {

        debug(`found binary_sensors (switch) name ${switchConfig.name} pin ${switchConfig.pin}`);

        let unique_id = `j5_switch_on_pin_${switchConfig.pin}`;

        // Create an MQTTSwitch
        let switchObj = new MQTTSwitch({
            ...switchConfig,
            custom: {
                unique_id: `${unique_id}`  // Assuming pin is unique for each switch
            }
        }, this.mqttManager, this.addonConfig, switchConfig);
    }


}

module.exports = CustomIO;
