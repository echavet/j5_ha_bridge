const { spawn } = require('child_process')
const SerialPort = require('serialport');
const debug = require('debug')('util')
const error_ = require('debug')('errors')
const readline = require('readline');
const axios = require('axios');

const yaml = require('js-yaml');
const fs = require('fs');

const token = process.env.SUPERVISOR_TOKEN;

const CONFIG_API = 'http://supervisor/addons/self/options/config';
const MQTT_SERVICE_API = 'http://supervisor/services/mqtt';

const CONFIGURABLE_FIRMATA_BAUD_RATE = 115200;

/** Arduino USB vendor IDs (official + old org). */
const ARDUINO_USB_VENDORS = new Set(['2341', '2a03']);

/**
 * Known Arduino USB product IDs (vendor 2341 / 2a03) — display only, not exhaustive.
 * adcHint is informational when Firmata does not report RESOLUTION.ADC.
 */
const ARDUINO_USB_PRODUCTS = {
    '0001': { name: 'Uno (legacy)', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0010': { name: 'Mega 2560', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0036': { name: 'Leonardo', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0037': { name: 'Micro', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '003d': { name: 'Due Programming Port', adcHint: '12 bits, Vref ≈ 3,3 V' },
    '003e': { name: 'Due Native USB', adcHint: '12 bits, Vref ≈ 3,3 V' },
    '003f': { name: 'Mega ADK', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0042': { name: 'Mega 2560 R3', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0043': { name: 'Uno R3', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '0044': { name: 'Mega ADK R3', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '004d': { name: 'Zero Programming Port', adcHint: '12 bits (0-4095), Vref ≈ 3,3 V' },
    '004e': { name: 'Zero Native USB (old)', adcHint: '12 bits (0-4095), Vref ≈ 3,3 V' },
    '004f': { name: 'MKR1000', adcHint: '12 bits, Vref ≈ 3,3 V' },
    '0058': { name: 'Mega 2560 R3 (alt)', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '8036': { name: 'Leonardo (Native)', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '8037': { name: 'Micro (Native)', adcHint: '10 bits (0-1023), Vref ≈ 5 V' },
    '804d': { name: 'Zero Native USB', adcHint: '12 bits (0-4095), Vref ≈ 3,3 V' },
    '804e': { name: 'Zero Native USB (CDC)', adcHint: '12 bits (0-4095), Vref ≈ 3,3 V' },
    '804f': { name: 'MKR1000 (Native)', adcHint: '12 bits, Vref ≈ 3,3 V' },
};

module.exports = {
    getAddress,
    openShell,
    handleError,
    detectPort,
    getAddonConfig,
    getMQTTConfig,
    waitForEnterKey,
    printData,
    convertWith_,
    logSerialPortIdentity,
    identifyArduinoUsb,
    logAddonLine,
    CONFIGURABLE_FIRMATA_BAUD_RATE,
};

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
    error_('--- Une erreur est survenue -- ');
    error_(`${error}`)
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

/**
 * Log a line to HA addon console only.
 * (Avoid also calling debug() — DEBUG=util* would duplicate every line.)
 * @param {string} msg
 */
function logAddonLine(msg) {
    console.log(`[j5_ha_bridge] ${msg}`);
}

/**
 * Normalize USB id hex (accepts "0x0043", "0043", 0x43, 67).
 * @param {string|number|null|undefined} id
 * @returns {string}
 */
function normalizeUsbId(id) {
    if (id == null || id === '') {
        return '';
    }
    if (typeof id === 'number') {
        return id.toString(16).toLowerCase().padStart(4, '0');
    }
    return String(id).toLowerCase().replace(/^0x/, '');
}

/**
 * Resolve symlinks (e.g. /dev/serial/by-id/... → /dev/ttyACM0).
 * Returns the original path if resolution fails.
 * @param {string} devicePath
 * @returns {string}
 */
function resolveDevicePath(devicePath) {
    if (!devicePath) {
        return devicePath;
    }
    try {
        return fs.realpathSync(devicePath);
    } catch (_) {
        return devicePath;
    }
}

/**
 * Parse Linux udev by-id basenames for productId / serial when SerialPort.list()
 * has no udev metadata (common inside HA addon containers).
 *
 * Examples:
 *   usb-Arduino__www.arduino.cc__0043_24236323730351306161-if00
 *   usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0
 *
 * @param {string} devicePath full path or basename from user config
 * @returns {{ productId: string|null, serialNumber: string|null, rawName: string|null }}
 */
function parseSerialByIdPath(devicePath) {
    const empty = { productId: null, serialNumber: null, rawName: null };
    if (!devicePath) {
        return empty;
    }
    const parts = String(devicePath).split('/').filter(Boolean);
    const base = parts.length ? parts[parts.length - 1] : '';
    if (!base) {
        return empty;
    }

    // Arduino / many CDC devices: ...__0043_<serial>-if00
    let m = base.match(/__([0-9A-Fa-f]{4})_([^-]+?)(?:-if\d+|-port\d+)*$/);
    if (m) {
        return {
            productId: m[1].toLowerCase(),
            serialNumber: m[2],
            rawName: base,
        };
    }

    // Broader: last _XXXX_token before -if/-port
    m = base.match(/_([0-9A-Fa-f]{4})_([A-Za-z0-9]+)(?:-if\d+|-port\d+)*$/);
    if (m) {
        return {
            productId: m[1].toLowerCase(),
            serialNumber: m[2],
            rawName: base,
        };
    }

    return { productId: null, serialNumber: null, rawName: base };
}

/**
 * Whether a SerialPort.list() entry matches the user-configured device path.
 * Never hardcodes a port: configuredPath always comes from addon config.
 * @param {string} configuredPath
 * @param {object} portInfo entry from SerialPort.list()
 * @param {string} [configuredResolved] optional precomputed realpath
 * @returns {boolean}
 */
function serialPortMatchesConfig(configuredPath, portInfo, configuredResolved) {
    if (!configuredPath || !portInfo) {
        return false;
    }
    if (portInfo.path === configuredPath) {
        return true;
    }
    const resolvedConfig = configuredResolved != null
        ? configuredResolved
        : resolveDevicePath(configuredPath);
    const resolvedListed = resolveDevicePath(portInfo.path);
    if (resolvedConfig && resolvedListed && resolvedConfig === resolvedListed) {
        return true;
    }
    // by-id path often embeds serialNumber; pnpId may appear in by-path names
    if (portInfo.serialNumber && configuredPath.includes(portInfo.serialNumber)) {
        return true;
    }
    if (portInfo.pnpId && configuredPath.includes(portInfo.pnpId)) {
        return true;
    }
    // serial embedded in by-id when list() has empty serialNumber
    const fromById = parseSerialByIdPath(configuredPath);
    if (fromById.serialNumber && portInfo.path && resolvedConfig === resolvedListed) {
        return true;
    }
    return false;
}

/**
 * Map Arduino USB productId to a human-readable board family (+ optional ADC hint).
 * @param {string|number} productId
 * @param {string|number} [vendorId]
 * @returns {{ label: string, adcHint: string|null }}
 */
function identifyArduinoUsb(productId, vendorId) {
    if (productId == null || productId === '') {
        return { label: 'inconnu (productId absent)', adcHint: null };
    }
    const pid = normalizeUsbId(productId);
    const vid = normalizeUsbId(vendorId);
    const entry = ARDUINO_USB_PRODUCTS[pid];
    const isArduinoVendor = vid && ARDUINO_USB_VENDORS.has(vid);

    if (entry && isArduinoVendor) {
        return { label: entry.name, adcHint: entry.adcHint || null };
    }
    if (entry && !vid) {
        // Some environments omit vendorId; still show the known product name.
        return { label: `${entry.name} (via productId ${pid})`, adcHint: entry.adcHint || null };
    }
    if (entry) {
        return {
            label: `${entry.name} (vendorId=${vid || '?'} non Arduino)`,
            adcHint: entry.adcHint || null,
        };
    }
    return {
        label: `non reconnu (vid=${vid || '?'}, pid=${pid})`,
        adcHint: null,
    };
}

/**
 * Prefer udev fields from SerialPort.list(); fall back to by-id path parsing
 * (HA containers often expose the device node without vendorId/productId).
 * @param {object|null} portInfo
 * @param {string} configuredPath
 * @returns {{ productId: string|null, vendorId: string|null, serialNumber: string|null, source: string }}
 */
function resolveUsbIdentity(portInfo, configuredPath) {
    const fromById = parseSerialByIdPath(configuredPath);
    const productId = (portInfo && portInfo.productId) || fromById.productId || null;
    const vendorId = (portInfo && portInfo.vendorId) || null;
    const serialNumber = (portInfo && portInfo.serialNumber) || fromById.serialNumber || null;
    let source = 'none';
    if (portInfo && portInfo.productId) {
        source = 'serialport';
    } else if (fromById.productId) {
        source = 'by-id path';
    }
    return { productId, vendorId, serialNumber, source };
}

/**
 * Log configured serial device + USB enumeration (visible in HA addon logs via console).
 * The device path is always the one from addon config — nothing is hardcoded.
 * Safe to call before opening the port; never rejects.
 * @param {string} configuredPath path from addon config (device)
 * @param {number|string} baudrate
 * @returns {Promise<object|null>} matching port info if found
 */
async function logSerialPortIdentity(configuredPath, baudrate) {
    logAddonLine('--- Identité port série / carte ---');
    logAddonLine(`Config device   : ${configuredPath}`);
    logAddonLine(`Config baudrate : ${baudrate}`);

    const configuredResolved = resolveDevicePath(configuredPath);
    if (configuredResolved && configuredResolved !== configuredPath) {
        logAddonLine(`Config résolu   : ${configuredResolved}`);
    }

    const byIdHint = parseSerialByIdPath(configuredPath);
    if (byIdHint.productId) {
        logAddonLine(`by-id productId : ${byIdHint.productId}${byIdHint.serialNumber ? `  serial=${byIdHint.serialNumber}` : ''}`);
    }

    try {
        const ports = await SerialPort.list();
        if (!ports || ports.length === 0) {
            // Still identify from by-id alone (no list metadata in some containers)
            const usb = resolveUsbIdentity(null, configuredPath);
            const id = identifyArduinoUsb(usb.productId, usb.vendorId);
            logAddonLine('Aucun port série listé par SerialPort.list().');
            if (usb.productId) {
                logAddonLine(`Identification (by-id) : ${id.label}  [source=${usb.source}]`);
                if (id.adcHint) {
                    logAddonLine(`ADC typique           : ${id.adcHint}`);
                }
            }
            logAddonLine('--------------------------------');
            return null;
        }

        logAddonLine(`Ports USB/série détectés (${ports.length}) :`);
        let match = null;
        for (const p of ports) {
            const isMatch = serialPortMatchesConfig(configuredPath, p, configuredResolved);
            if (isMatch) {
                match = p;
            }
            // For each listed port, enrich with by-id only when it is the configured device
            const usb = isMatch
                ? resolveUsbIdentity(p, configuredPath)
                : {
                    productId: p.productId || null,
                    vendorId: p.vendorId || null,
                    serialNumber: p.serialNumber || null,
                    source: p.productId ? 'serialport' : 'none',
                };
            const id = identifyArduinoUsb(usb.productId, usb.vendorId);

            const mark = isMatch ? '>>> ' : '    ';
            logAddonLine(`${mark}path=${p.path}`);
            logAddonLine(`${mark}  manufacturer=${p.manufacturer || '-'} vendorId=${usb.vendorId || p.vendorId || '-'} productId=${usb.productId || '-'}`);
            logAddonLine(`${mark}  serialNumber=${usb.serialNumber || '-'} pnpId=${p.pnpId || '-'}  idSource=${usb.source}`);
            logAddonLine(`${mark}  carte (USB)≈ ${id.label}`);
        }

        if (match) {
            const usb = resolveUsbIdentity(match, configuredPath);
            const id = identifyArduinoUsb(usb.productId, usb.vendorId);
            logAddonLine(`Port configuré trouvé : ${match.path}`);
            logAddonLine(`Identification USB    : ${id.label}  [source=${usb.source}]`);
            if (id.adcHint) {
                logAddonLine(`ADC typique (USB)     : ${id.adcHint}`);
            }
        } else {
            // Configured path may still be usable even if list matching failed
            const usb = resolveUsbIdentity(null, configuredPath);
            const id = identifyArduinoUsb(usb.productId, usb.vendorId);
            logAddonLine(`ATTENTION: le device configuré ne correspond à aucun port listé.`);
            if (usb.productId) {
                logAddonLine(`Identification (by-id) : ${id.label}  [source=${usb.source}]`);
                if (id.adcHint) {
                    logAddonLine(`ADC typique           : ${id.adcHint}`);
                }
            }
            logAddonLine(`Vérifiez options "device" de l'addon, le by-id, et les droits du conteneur.`);
        }
        logAddonLine('--------------------------------');
        return match;
    } catch (err) {
        logAddonLine(`Impossible de lister les ports série: ${err && err.message ? err.message : err}`);
        const usb = resolveUsbIdentity(null, configuredPath);
        const id = identifyArduinoUsb(usb.productId, usb.vendorId);
        if (usb.productId) {
            logAddonLine(`Identification (by-id) : ${id.label}  [source=${usb.source}]`);
            if (id.adcHint) {
                logAddonLine(`ADC typique           : ${id.adcHint}`);
            }
        }
        logAddonLine('--------------------------------');
        return null;
    }
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
            const serialPort = new SerialPort(port.path, { baudRate: CONFIGURABLE_FIRMATA_BAUD_RATE });

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