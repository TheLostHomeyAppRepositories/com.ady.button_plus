'use strict';

class DeviceStateChangeDispatcher
{

    constructor(app)
    {
        this.api = app.api;
        this.deviceManager = app.deviceManager;
        this.app = app;
        this.lastValues = new Map();
        this._init();
    }

    async _init()
    // eslint-disable-next-line no-empty-function
    {
    }

    async registerDeviceCapability(device, capabilityId)
    {
        if (!device || !capabilityId)
        {
            this.app.updateLog('Error registering device capability: missing device or capabilityId', 0);
            return;
        }

        // Check if the device is an object or a string
        if (typeof device === 'string')
        {
            // Get the device object
            device = await this.deviceManager.getDeviceById(device);
        }

        if (!device)
        {
            this.app.updateLog('Error registering device capability: device not found', 0);
            return;
        }

        if ((device.driverId.search('panel_hardware') >= 0) && (capabilityId === 'measure_temperature'))
        {
            return;
        }

        const capability = `${device.id}_${capabilityId}`;
        try
        {
            if (this.lastValues.has(capability))
            {
                this.app.updateLog(`Capability listener already registered: ${capability}`, 1);
//                return;
            }
            this.app.updateLog(`Registering capability listener: ${capability}`, 1);
            this.lastValues.set(capability, null);
            await device.makeCapabilityInstance(capabilityId, (value) => this._handleStateChange(device, value, capabilityId));
        }
        catch (e)
        {
            this.app.updateLog(`Error registering capability: ${capability}, ${e.message}`, 0);
        }
    }

    _handleStateChange(device, value, capability)
    {
        const deviceId = device.id;
        const lastValue = this.lastValues.get(`${deviceId}_${capability}`);
        // eslint-disable-next-line eqeqeq
        if (lastValue == value)
        {
            this.app.updateLog(`Capability changed: ${device.name}, ${capability}, ${value}, same as previous value`);
            return;
        }

        this.app.updateLog(`Capability changed: ${device.name}, ${capability}, ${value}`);

        this.lastValues.set(`${deviceId}_${capability}`, value);

        // Get devices and check if they have a checkStateChange function
        const drivers = this.app.homey.drivers.getDrivers();
        for (const driver of Object.values(drivers))
        {
            let devices = driver.getDevices();
            for (let device of Object.values(devices))
            {
                if (device.checkStateChange)
                {
                    try
                    {
                        // request the device to check the state change
                        device.checkStateChange(deviceId, capability, value);
                    }
                    catch (error)
                    {
                        this.app.updateLog(`_handleStateChange: ${error.message}`, 0);
                    }
                }

                device = null;
            }
            devices = null;
        }
    }

    destroy()
    {
        // TODO: implement
    }

}

module.exports = DeviceStateChangeDispatcher;
