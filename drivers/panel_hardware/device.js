'use strict';

const BasePanelDevice = require('../base_panel_device');

class PanelDevice extends BasePanelDevice
{

    /**
     * onInit is called when the device is initialized.
     */
    async onInit()
    {
        await super.onInit();
        if (!this.hasCapability('measure_temperature'))
        {
            await this.addCapability('measure_temperature');
        }

        if (!this.hasCapability('date'))
        {
            await this.addCapability('date');
        }

        if (!this.hasCapability('time'))
        {
            await this.addCapability('time');
        }

        if (!this.hasCapability('dim.large'))
        {
            await this.addCapability('dim.large');
        }

        if (!this.hasCapability('dim.small'))
        {
            await this.addCapability('dim.small');
        }

        if (!this.hasCapability('dim.led'))
        {
            await this.addCapability('dim.led');
        }

        this.registerCapabilityListener('dim.large', this.onCapabilityDim.bind(this, 'largedisplay'));
        this.registerCapabilityListener('dim.small', this.onCapabilityDim.bind(this, 'minidisplay'));
        this.registerCapabilityListener('dim.led', this.onCapabilityDim.bind(this, 'leds'));

        const ip = this.getSetting('address');
        this.homey.app.setupPanelTemperatureTopic(ip, this.__id);

        this.dateTimer = null;
        const dateTime = this.updateTime();

        // Calculate the number of ms until next while minute
        const msUntilNextMinute = (60 - dateTime.getSeconds()) * 1000;

        // Set a timeout to update the time every minute
        this.homey.setTimeout(() =>
        {
            this.updateTime();
            this.dateTimer = this.homey.setInterval(() => this.updateTime(), 60000);
        }, msUntilNextMinute);

        const mqttClient = this.homey.app.getMqttClient('homey');
        await this.setupMQTTSubscriptions(mqttClient);

        this.log('PanelDevice has been initialized');
    }

    async setupMQTTSubscriptions(MQTTclient)
    {
        const { id } = this.getData();
        MQTTclient.subscribe(`${id}/brightness/largedisplay/value`, (err) =>
        {
            if (err)
            {
                this.updateLog("setupMQTTClient.onConnect 'homey/toggle' error: " * this.varToString(err), 0);
            }
            else
            {
                const value = this.getCapabilityValue('dim.large');
                this.homey.app.publishMQTTMessage('homey', `${id}/brightness/largedisplay/value`, value * 100);
            }
        });
        MQTTclient.subscribe(`${id}/brightness/minidisplay/value`, (err) =>
        {
            if (err)
            {
                this.updateLog("setupMQTTClient.onConnect 'homey/toggle' error: " * this.varToString(err), 0);
            }
            else
            {
                const value = this.getCapabilityValue('dim.small');
                this.homey.app.publishMQTTMessage('homey', `${id}/brightness/minidisplay/value`, value * 100);
            }
        });
        MQTTclient.subscribe(`${id}/brightness/leds/value`, (err) =>
        {
            if (err)
            {
                this.updateLog("setupMQTTClient.onConnect 'homey/toggle' error: " * this.varToString(err), 0);
            }
            else
            {
                const value = this.getCapabilityValue('dim.led');
                this.homey.app.publishMQTTMessage('homey', `${id}/brightness/leds/value`, value * 100);
            }
        });
    }

    async onCapabilityDim(mqttTopic, value, opts)
    {
        if (opts && opts.mqtt)
        {
            // From MQTT, don't send it back
            return;
        }
    
        // Publish the new value to the MQTT broker
        const { id } = this.getData();
        this.homey.app.publishMQTTMessage('homey', `${id}/brightness/${mqttTopic}/value`, value * 100);
    }

    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded()
    {
        await super.onAdded();
        this.log('PanelDevice has been added');
    }

    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ oldSettings, newSettings, changedKeys })
    {
        await super.onSettings({ oldSettings, newSettings, changedKeys });
        if (changedKeys.includes('address'))
        {
            // Ensure it is a valid IP address
            const ip = newSettings.address;
            if (!ip.match(/^(\d{1,3}\.){3}\d{1,3}$/))
            {
                throw new Error('Invalid IP address');
            }
        }

        if (changedKeys.includes('invertMiniDisplay'))
        {
            const ip = this.getSetting('address');
            const deviceConfiguration = {
                core: {
                    invert: newSettings.invertMiniDisplay,
                },
            };
            const result = await this.homey.app.writeDeviceConfiguration(ip, deviceConfiguration, true);
            if (result)
            {
                throw new Error('Failed to send the configuration to the device');
            }
        }
    }

    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name)
    {
        await super.onRenamed(name);
        this.log('PanelDevice was renamed');
    }

    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted()
    {
        if (this.dateTimer)
        {
            this.homey.clearInterval(this.dateTimer);
        }

        await super.onDeleted();
        this.log('PanelDevice has been deleted');
    }

    async processMQTTBtnMessage(topic, MQTTMessage)
    {
        // search the topic for the device id
        if (topic[1] === 'brightness')
        {
            const dim = parseFloat(MQTTMessage) / 100;
            if (topic[2] === 'largedisplay')
            {
                this.triggerCapabilityListener('dim.large', dim, { mqtt: true })
            }
            else if (topic[2] === 'minidisplay')
            {
                this.triggerCapabilityListener('dim.small', dim, { mqtt: true })
            }
            else if (topic[2] === 'leds')
            {
                this.triggerCapabilityListener('dim.led', dim, { mqtt: true })
            }
        }
    }

}

module.exports = PanelDevice;
