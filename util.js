const { spawn } = require('child_process')
const SerialPort = require('serialport');
const debug = require('debug')('util')
const readline = require('readline');
const axios = require('axios');

const yaml = require('js-yaml');
const fs = require('fs');

const token = process.env.SUPERVISOR_TOKEN;

const CONFIG_API = 'http://supervisor/addons/self/options/config';
const MQTT_SERVICE_API = 'http://supervisor/services/mqtt';

module.exports = { getAddress, openShell, handleError, detectPort, getAddonConfig, getMQTTConfig, waitForEnterKey, printData, convertWith_ };

const CONFIGURABLE_FIRMATA_BAUD_RATE = 115200;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


/*function waitForEnterKey() {
    rl.question("Appuyez sur la touche Entrée pour continuer...", (answer) => {
        rl.close();
    });
}*/
function waitForEnterKey() {
    return new Promise((resolve) => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', (data) => {
            if (data.toString() === '\x0D') { // '\x0D' correspond au code de la touche Entrée
                process.stdin.setRawMode(false);
                process.stdin.pause();
                resolve();
            } else {
                process.stdin.removeAllListeners('data'); // Supprime l'écouteur d'événement 'data'
                waitForEnterKey().then(resolve); // Réessayez d'attendre l'appui sur la touche Entrée
            }
        });
    });
}
async function handleError(error) {
    debug('Une erreur est survenue :');
    debug(`${error}`);
    console.error(error);

    //openShell();
    //waitForEnterKey();
}

function convertWith_(name) {
    const noAccent = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const noSpace = noAccent.replace(/\s+/g, "_");
    const lowerCase = noSpace.toLowerCase();
    return lowerCase;
}

function getAddress(device) {
    // 64-bit device code
    // device[0]    => Family Code
    // device[1..6] => Serial Number (device[1] is LSB)
    // device[7]    => CRC
    let i;

    let result = 0;
    for (i = 6; i > 0; i--) {
        result = result * 256 + device[i];
    }
    return result;
}

function openShell() {
    console.log("Attention, un shell est ouvert pour vous permettre de chercher l'erreur...");
    console.log("Tapez exit + RC pour quitter");
    const shell = spawn('sh', [], { stdio: 'inherit' });

    shell.on('error', (error) => {
        console.error('Une erreur est survenue lors de l\'ouverture du shell :', error);
    });

    shell.on('exit', () => {
        console.log('Shell fermé');
    });
}

function loadYamlFile(filepath, callback) {
    try {
        const fileContents = fs.readFileSync(filepath, 'utf8');
        const data = yaml.load(fileContents);
        callback(data);
    } catch (e) {
        console.error(`Error reading YAML file: ${filepath}`);
        console.error(e);
    }
}

function fakeGetYamlAddonConfig(callback) {
    loadYamlFile('addon_config.yaml', callback);
}

function fakeGetYamlMQTTConfig(callback) {
    loadYamlFile('mqtt_config.yaml', callback);
}

function fakeGetAddonConfig(callback) {
    let config = {
        //device: "/dev/tty.usbmodem14102",
        device: "/dev/tty.usbmodem1432402",
        baudrate: 115200,
        switches: [],
        lights: [],
        sensors: [{
            name: "Thermometer",
            pin: 12,
            type: "thermometer-DS18B20-Auto",
            unit: "°"
        }
        ]
    };
    callback(config);
}

function getAddonConfig(callback) {
    if (token == undefined) {
        debug("Attention, exécution en DEV");
        //fakeGetAddonConfig(callback);
        fakeGetYamlAddonConfig(callback);
        return;
    }

    axiosRequest(CONFIG_API, callback);
}

function fakeGetMQTTConfig(callback) {
    let config = {
        addon: "MQTT Addon",
        host: "192.168.1.14",
        port: 1883,
        ssl: false,
        password: "mqtttestclient",
        username: "mqtttestclient",
        protocol: "mqtt://"
    };
    callback(config);
}

function getMQTTConfig(callback) {
    if (token == undefined) {
        debug("Attention, exécution en DEV");
        fakeGetYamlMQTTConfig(callback);
        return;
    }
    axiosRequest(MQTT_SERVICE_API, callback);
}


function axiosRequest(api, callback) {
    axios.get(api, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    }).then(response => {

        if (response.data.result == 'ok') {
            debug("L'appel de l'API s'est bien passé", `${response.data.result}`);
            callback(response.data.data);
        } else {
            debug("L'appel de l'API a retourné une erreur", `${response.data.result}`);
            console.error("L'appel de l'API a retourné une erreur");
            console.error(response.data.result);
        }
    }).catch(error => {
        console.error(error);
    });
}

// Fonction pour détecter le port de connexion de la carte
function detectPort(portDetectedCallback) {
    SerialPort.list().then((ports) => {

        //const port = ports.find((port) => /usb|acm|^com/i.test(port.path));
        const availablePorts = ports.filter((port) => /usb|acm|^com/i.test(port.path));

        function tryPort(index) {
            if (index >= availablePorts.length) {
                portDetectedCallback(new Error('No available port detected'));
                return;
            }

            const port = availablePorts[index];
            const serialPort = new SerialPort(port.path, { baudRate: util.CONFIGURABLE_FIRMATA_BAUD_RATE });

            serialPort.on('open', () => {
                portDetectedCallback(null, port.path);
                serialPort.close();
            });

            serialPort.on('error', (err) => {
                console.warn(`Failed to open port ${port.path}: ${err.message}`);
                tryPort(index + 1);
            });
        }

        tryPort(0);


        /*if (port) {
          portDetectedCallback(null, port.path);
        } else {
          portDetectedCallback(new Error('No port detected'));
        }*/
    });
}

function printData(address, celsius, fahrenheit, kelvin) {
    /*debug(`Thermometer at address: 0x${address.toString(16)}`);
    debug("  celsius      : ", celsius);
    debug("  fahrenheit   : ", fahrenheit);
    debug("  kelvin       : ", kelvin);
    debug("--------------------------------------");*/
    console.log(`Thermometer at address: 0x${address.toString(16)}`);
    console.log("  celsius      : ", celsius);
    console.log("  fahrenheit   : ", fahrenheit);
    console.log("  kelvin       : ", kelvin);
    console.log("--------------------------------------");
}