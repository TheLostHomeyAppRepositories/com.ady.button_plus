/* eslint-disable max-len */
/* eslint-disable camelcase */

'use strict';

const { Device } = require('homey');

class PanelDevice extends Device
{

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit()
	{
		this.initFinished = false;
		this.longPressOccurred = new Map();

		const { id } = this.getData();
		this.id = id;

		const settings = this.getSettings();

		this.ip = settings.address;

		if (!settings.statusbar)
		{
			settings.statusbar = 2;
		}

		this.langCode = settings.langCode;
		if (!this.langCode)
		{
			this.langCode = this.homey.i18n.getLanguage();
			settings.langCode = this.langCode;
		}

		this.weekdayFormat = settings.weekdayFormat;
		if (this.weekdayFormat == null)
		{
			settings.weekdayFormat = 'none';
		}

		this.dateFormat = settings.dateFormat;
		if (this.dateFormat == null)
		{
			this.dateFormat = '2-digit';
			settings.dateFormat = this.dateFormat;
		}

		this.monthFormat = settings.monthFormat;
		if (this.monthFormat == null)
		{
			this.monthFormat = 'short';
			settings.monthFormat = this.monthFormat;
		}

		this.yearFormat = settings.yearFormat;
		if (this.yearFormat == null)
		{
			this.yearFormat = 'numeric';
			settings.yearFormat = this.yearFormat;
		}

		this.timeFormat = settings.timeFormat;
		if (this.timeFormat == null)
		{
			this.timeFormat = 'T24';
			settings.timeFormat = this.timeFormat;
		}

		this.temperatureCalibration = settings.temperatureCalibration;
		if (this.temperatureCalibration == null)
		{
			this.temperatureCalibration = 0;
			settings.temperatureCalibration = 0;
		}

		this.setSettings(settings).catch(this.error);

		if (this.hasCapability('configuration.display'))
		{
			try
			{
				await this.removeCapability('configuration.display');
			}
			catch (error)
			{
				this.error(error);
			}
		}

		this.registerCapabilityListener('configuration_display', this.onCapabilityDisplayConfiguration.bind(this));

		this.buttonTime = [];
		await this.configureConnector(settings.connect0Type, 0);
		await this.configureConnector(settings.connect1Type, 1);
		await this.configureConnector(settings.connect2Type, 2);
		await this.configureConnector(settings.connect3Type, 3);
		await this.configureConnector(settings.connect4Type, 4);
		await this.configureConnector(settings.connect5Type, 5);
		await this.configureConnector(settings.connect6Type, 6);
		await this.configureConnector(settings.connect7Type, 7);

		if (!this.hasCapability('info'))
		{
			await this.addCapability('info');
		}

		await this.registerCapabilityListener('info', this.onCapabilityInfo.bind(this));

		this.checkGatewayConfig();

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

		if (this.hasCapability('dim.large'))
		{
			await this.removeCapability('dim.large');
		}

		if (this.hasCapability('dim.small'))
		{
			await this.removeCapability('dim.small');
		}

		if (this.hasCapability('dim.led'))
		{
			await this.removeCapability('dim.led');
		}

		if (!this.hasCapability('button.update_firmware'))
		{
			await this.addCapability('button.update_firmware');
		}

		if (!this.hasCapability('button.apply_config'))
		{
			await this.addCapability('button.apply_config');
		}

		// this.registerCapabilityListener('dim.large', this.onCapabilityDim.bind(this, 'large'));
		// this.registerCapabilityListener('dim.small', this.onCapabilityDim.bind(this, 'mini'));
		// this.registerCapabilityListener('dim.led', this.onCapabilityDim.bind(this, 'leds'));

		this.registerCapabilityListener('button.update_firmware', async () =>
		{
			// Maintenance action button was pressed
			return this.homey.app.updateFirmware(this.ip);
		});

		this.registerCapabilityListener('button.apply_config', async () =>
		{
			// Maintenance action button was pressed
			await this.uploadConfigurations();
		});

		await this.setupMQTTSubscriptions('Default');

		await this.uploadConfigurations();

		this.log('PanelDevice has been initialized');
		this.initFinished = true;
	}

	async setupMQTTSubscriptions(brokerId)
	{
		const mqttClient = this.homey.app.getMqttClient(brokerId);

		if (!mqttClient)
		{
			return;
		}

		if (this.firmware >= 1.09)
		{
			let value = 1; // this.getCapabilityValue('dim.large');
			this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/brightness/large/value`, value * 255).catch(this.error);

			value = 1; // this.getCapabilityValue('dim.small');
			this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/brightness/mini/value`, value * 255).catch(this.error);

			// value = this.getCapabilityValue('dim.led');
			// this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/brightness/leds/value`, value * 100);

			value = 1;
			if (this.page !== null)
			{
				value = `${this.page - 1}`;
			}
			this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/setpage/value`, value);

			mqttClient.subscribe(`homey/${this.id}/currentpage/value`, (err) =>
			{
				if (err)
				{
					this.homey.app.updateLog("setupMQTTClient.subscribe 'currentpage/value' error: " * this.homey.app.varToString(err), 0);
				}
			});
		}
	}

	async onCapabilityDim(mqttTopic, value, opts)
	{
		this.homey.app.triggerDim(this, mqttTopic, value);
		if (opts && opts.mqtt)
		{
			// From MQTT, don't send it back
			return;
		}

		// Publish the new value to the MQTT broker
		const brokerId = this.homey.settings.get('defaultBroker');
		this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/brightness/${mqttTopic}/value`, value * 100).catch(this.error);
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
			this.ip = ip;
		}
		if (changedKeys.includes('mac'))
		{
			// Ensure it is a valid MAC address
			const { mac } = newSettings;
			if (!mac.match(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/))
			{
				throw new Error('Invalid MAC address');
			}
		}

		let updateDateAndTime = false;
		// All others should be date and time related
		if (changedKeys.includes('langCode'))
		{
			// Ensure it is a valid language code
			const { langCode } = newSettings;
			if (!langCode.match(/^[a-z]{2}$/))
			{
				throw new Error('Invalid language code');
			}

			this.langCode = langCode;
		}

		if (changedKeys.includes('weekdayFormat'))
		{
			this.weekdayFormat = newSettings.weekdayFormat;
			updateDateAndTime = true;
		}

		if (changedKeys.includes('dateFormat'))
		{
			this.dateFormat = newSettings.dateFormat;
			updateDateAndTime = true;
		}

		if (changedKeys.includes('monthFormat'))
		{
			this.monthFormat = newSettings.monthFormat;
			updateDateAndTime = true;
		}

		if (changedKeys.includes('yearFormat'))
		{
			this.yearFormat = newSettings.yearFormat;
			updateDateAndTime = true;
		}

		if (changedKeys.includes('timeFormat'))
		{
			this.timeFormat = newSettings.timeFormat;
			updateDateAndTime = true;
		}

		if (changedKeys.includes('statusbar'))
		{
			setImmediate(() =>
			{
				this.updateStatusBar(this).catch(this.error);
			});
		}

		if (updateDateAndTime)
		{
			// Allow for Homey's timezone setting
			const tzString = this.homey.clock.getTimezone();
			let dateTime = new Date();
			dateTime = new Date(dateTime.toLocaleString('en-US', { timeZone: tzString }));

			setImmediate(() =>
			{
				this.updateDateAndTime(dateTime).catch(this.error);
			});
		}

		if (changedKeys.includes('temperatureCalibration'))
		{
			this.temperatureCalibration = newSettings.temperatureCalibration;
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
		await super.onDeleted();
		this.log('PanelDevice has been deleted');
	}

	async processMQTTBtnMessage(topic, MQTTMessage)
	{
		if (!this.initFinished)
		{
			return;
		}

		// search the topic for the device id
		if (topic[1] === 'brightness')
		{
			const dim = parseFloat(MQTTMessage) / 100;
			if (topic[2] === 'large')
			{
				this.triggerCapabilityListener('dim.large', dim, { mqtt: true }).catch((e) => this.homey.app.updateLog(this.homey.app.varToString(e), 0));
			}
			else if (topic[2] === 'mini')
			{
				this.triggerCapabilityListener('dim.small', dim, { mqtt: true }).catch((e) => this.homey.app.updateLog(this.homey.app.varToString(e), 0));
			}
			else if (topic[2] === 'leds')
			{
				this.triggerCapabilityListener('dim.led', dim, { mqtt: true }).catch((e) => this.homey.app.updateLog(this.homey.app.varToString(e), 0));
			}
		}
	}

	getBrokerIdAndBtnIdx(left_right, connector)
	{
		let brokerId = 'Default';
		const buttonIdx = connector * 2 + left_right === 'right' ? 1 : 0;
		if (this.hasCapability(`configuration_button.connector${connector}`))
		{
			// Get the configuration number for this connector
			const configNo = this.getCapabilityValue(`configuration_button.connector${connector}`);
			const item = this.homey.app.buttonConfigurations[configNo];
			if (item)
			{
				if (left_right === 'left')
				{
					brokerId = item.leftBrokerId;
				}
				else
				{
					brokerId = item.rightBrokerId;
				}
			}
		}

		return { brokerId, buttonIdx };
	}

	findConnectUsingConfigNo(configNo)
	{
		// Find the button connector that has this configuration
		for (let connector = 0; connector < 8; connector++)
		{
			if (this.hasCapability(`configuration_button.connector${connector}`))
			{
				// Get the configuration number for this connector
				const config = this.getCapabilityValue(`configuration_button.connector${connector}`);
				// eslint-disable-next-line eqeqeq
				if (config == configNo)
				{
					return connector;
				}
			}
		}

		throw new Error('Configuration is not assigned to a button');
	}

	async updateConnectorTopLabel(left_right, connector, label)
	{
		const { brokerId, buttonIdx } = this.getBrokerIdAndBtnIdx(left_right, connector);
		return this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/${buttonIdx}/toplabel`, label).catch(this.error);
	}

	async updateConnectorText(left_right, connector, label)
	{
		const { brokerId, buttonIdx } = this.getBrokerIdAndBtnIdx(left_right, connector);
		return this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/${buttonIdx}/label`, label).catch(this.error);
	}

	async updateConfigTopLabel(left_right, configNo, label)
	{
		// Find the button connector that has this configuration
		const connector = this.findConnectUsingConfigNo(configNo);
		return this.updateConnectorTopLabel(left_right, connector, label);
	}

	async updateConfigLabel(left_right, configNo, label)
	{
		// Find the button connector that has this configuration
		const connector = this.findConnectUsingConfigNo(configNo);
		return this.updateConnectorText(left_right, connector, label);
	}

	async updateDateAndTime(dateTime)
	{
		if (this.hasCapability('date'))
		{
			let date = '';
			let formatString = { year: 'numeric', month: 'long', day: '2-digit' };
			formatString.day = this.dateFormat;
			formatString.month = this.monthFormat;
			formatString.year = this.yearFormat;
			const { weekdayFormat } = this;
			if (weekdayFormat !== 'none')
			{
				formatString.weekday = weekdayFormat;
			}

			try
			{
				// Get the date using the short month format
				date = dateTime.toLocaleDateString(this.langCode, formatString);
			}
			catch (err)
			{
				// Get the date using the long month format
				formatString = { year: 'numeric', month: 'long', day: '2-digit' };
				date = dateTime.toLocaleDateString(this.langCode, formatString);
			}

			let time = '';
			const tf = this.getSetting('timeFormat');
			if (tf === 'T24')
			{
				// get the time in the local format, but exclude seconds
				// eslint-disable-next-line object-curly-newline
				time = dateTime.toLocaleTimeString(this.langCode, { hour12: false, hour: '2-digit', minute: '2-digit' });
			}
			else
			{
				// get the time in the local format, but exclude seconds keeping am/pm if it's 12 hour format
				// eslint-disable-next-line object-curly-newline
				time = dateTime.toLocaleTimeString(this.langCode, { hour12: true, hour: 'numeric', minute: '2-digit' });
			}

			// Replace a . with a : in the time
			time = time.replace('.', ':');

			this.setCapabilityValue('date', date).catch(this.error);
			this.setCapabilityValue('time', time).catch(this.error);
		}
	}

	async updateStatusBar(deviceConfigurations)
	{
		if (this.ip !== '')
		{
			// If a device configuration is passed, just update that.
			if (deviceConfigurations)
			{
				deviceConfigurations.core.statusbar = this.getSetting('statusbar');
				return null;
			}

			try
			{
				const sectionConfiguration = {
					core:
					{
						statusbar: this.getSetting('statusbar'),
					},
				};

				this.homey.app.updateLog(`writeCore ${this.homey.app.varToString(sectionConfiguration)}`);

				return await await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
			}
			catch (err)
			{
				this.homey.app.updateLog(`Error setting up pane temperature topic: ${err.message}`, 0);
			}
		}

		return null;
	}

	async setDimLevel(large, mini)
	{
		if (this.ip !== '')
		{
			try
			{
				const sectionConfiguration = {
					core:
					{
						brightnesslargedisplay: large,
						brightnessminidisplay: mini,
					},
				};

				this.homey.app.updateLog(`writeCore ${this.homey.app.varToString(sectionConfiguration)}`);

				return await await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
			}
			catch (err)
			{
				this.homey.app.updateLog(`Error setting up pane temperature topic: ${err.message}`, 0);
			}
		}

		return null;
	}

	async setSetDisplayPage(pageCommand, page)
	{
		if (this.firmware < 1.09)
		{
			throw new Error('Firmware too old to support this feature');
		}

		const brokerId = this.homey.settings.get('defaultBroker');
		if (pageCommand === 'index')
		{
			if (!page)
			{
				this.page = 1;
			}
			else
			{
				this.page = page;
			}
			pageCommand = `${this.page - 1}`;
		}

		this.homey.app.publishMQTTMessage(brokerId, `homey/${this.id}/setpage/value`, pageCommand).catch(this.error);
	}

	async uploadPanelTemperatureConfiguration(deviceConfigurations)
	{
		if (this.ip !== '')
		{
			try
			{
				// Add the temperature event entry
				const brokerId = this.homey.settings.get('defaultBroker');
				const sectionConfiguration = {
					mqttsensors: [
					{
						sensorid: 1,
						interval: 10,
						calibrationOffset: this.temperatureCalibration,
						topic:
						{
							brokerid: brokerId,
							topic: `homey/${this.__id}/button_temperature/value`,
							payload: '',
							eventtype: 18,
						},
					}],
				};

				const MQTTclient = this.homey.app.MQTTClients.get(brokerId);
				if (MQTTclient)
				{
					MQTTclient.subscribe(`homey/${this.__id}/button_temperature/value`, (err) =>
					{
						if (err)
						{
							this.homey.app.updateLog("setupMQTTClient.onConnect 'homey/sensorvalue' error: " * this.homey.app.varToString(err), 0);
						}
					});
				}

				if (deviceConfigurations)
				{
					deviceConfigurations.mqttsensors = sectionConfiguration.mqttsensors;
					return null;
				}

				this.homey.app.updateLog(`writeSensorConfig: ${this.homey.app.varToString(sectionConfiguration)}`);
				return await await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
			}
			catch (err)
			{
				this.homey.app.updateLog(`Error setting up pane temperature topic: ${err.message}`, 0);
			}
		}

		return null;
	}

	async uploadCoreConfiguration(deviceConfigurations)
	{
		if (this.ip !== '')
		{
			if (this.firmware >= 1.09)
			{
				try
				{
					let writeConfig = false;
					if (!deviceConfigurations)
					{
						deviceConfigurations = { core: {} };
						writeConfig = true;
					}
					const brokerId = this.homey.settings.get('defaultBroker');
					deviceConfigurations.core = {
						topics: [
							{
								brokerid: brokerId,
								topic: `homey/${this.id}/brightness/large/value`,
								payload: '',
								eventtype: 24,
							},
							{
								brokerid: brokerId,
								topic: `homey/${this.id}/brightness/mini/value`,
								payload: '',
								eventtype: 25,
							},
							{
								brokerid: brokerId,
								topic: `homey/${this.id}/brightness/leds/value`,
								payload: '',
								eventtype: 26,
							},
							{
								brokerid: brokerId,
								topic: `homey/${this.id}/currentpage/value`,
								payload: '',
								eventtype: 6,
							},
							{
								brokerid: brokerId,
								topic: `homey/${this.id}/setpage/value`,
								payload: '',
								eventtype: 20,
							},
						],
					};

					this.homey.app.updateLog(`writeBrightnessConfig: ${this.homey.app.varToString(deviceConfigurations)}`);

					const MQTTclient = this.homey.app.MQTTClients.get(brokerId);
					if (MQTTclient)
					{
						this.setupMQTTSubscriptions(brokerId);
					}

					if (writeConfig)
					{
						return await await this.homey.app.writeDeviceConfiguration(this.ip, deviceConfigurations);
					}
					return null;
				}
				catch (err)
				{
					this.homey.app.updateLog(`Error setting up dim topics: ${err.message}`, 0);
					return `Error setting up dim topics: ${err.message}`;
				}
			}
			return null;
		}
		return 'No IP address';
	}

	async uploadConfigurations()
	{
		try
		{
			const deviceConfigurations = await this.homey.app.readDeviceConfiguration(this.ip);
			if (deviceConfigurations.info && deviceConfigurations.info.firmware)
			{
				this.firmware = parseFloat(deviceConfigurations.info.firmware);
				await this.setSettings({ firmware: deviceConfigurations.info.firmware });
			}
			await this.uploadCoreConfiguration(deviceConfigurations);
			await this.updateStatusBar(deviceConfigurations);
			await this.uploadAllButtonConfigurations(deviceConfigurations);
			await this.uploadDisplayConfigurations(deviceConfigurations);
			await this.uploadBrokerConfigurations(deviceConfigurations);
			await this.uploadPanelTemperatureConfiguration(deviceConfigurations);

			await this.homey.app.writeDeviceConfiguration(this.ip, deviceConfigurations);
		}
		catch (err)
		{
			this.homey.app.updateLog(`Error reading device configuration: ${err.message}`, 0);
		}
	}

	async configureConnector(connectType, connector)
	{
		try
		{
			// Remove old connectors configuration capabilities
			if (this.hasCapability(`configuration.connector${connector}`))
			{
				try
				{
					await this.removeCapability(`configuration.connector${connector}`);
				}
				catch (error)
				{
					this.error(error);
				}
			}

			if (connectType !== 1) // 0 = not fitted, 1 = button panel, 2 = display
			{
				if (this.hasCapability(`configuration_button.connector${connector}`))
				{
					await this.removeCapability(`configuration_button.connector${connector}`);
				}

				if (connectType !== 2)
				{
					await this.removeCapability(`left_button.connector${connector}`);
					await this.removeCapability(`right_button.connector${connector}`);
				}
				else
				{
					// Make sure a Disply configuration is assigned to this device
					if (!this.hasCapability('configuration_display'))
					{
						await this.addCapability('configuration_display');
					}

					const capabilityOption = {};
					capabilityOption.title = `${this.homey.__('display')} ${this.homey.__('connector')} ${connector + 1}`;
					this.setCapabilityOptions('configuration_display', capabilityOption);

					if (!this.hasCapability(`left_button.connector${connector}`))
					{
						await this.addCapability(`left_button.connector${connector}`);
						await this.addCapability(`right_button.connector${connector}`);
					}
					this.setCapabilityOptions(`configuration_button.connector${connector}`, capabilityOption);

					capabilityOption.title = `${this.homey.__('display')} ${this.homey.__('connector')} ${connector + 1} ${this.homey.__('left')}`;
					this.setCapabilityOptions(`left_button.connector${connector}`, capabilityOption);

					capabilityOption.title = `${this.homey.__('display')} ${this.homey.__('connector')} ${connector + 1} ${this.homey.__('right')}`;
					this.setCapabilityOptions(`right_button.connector${connector}`, capabilityOption);

					await this.registerCapabilityListener(`configuration_button.connector${connector}`, this.onCapabilityConfiguration.bind(this, connector));
					await this.registerCapabilityListener(`left_button.connector${connector}`, this.onCapabilityLeftButton.bind(this, connector));
					await this.registerCapabilityListener(`right_button.connector${connector}`, this.onCapabilityRightButton.bind(this, connector));
				}
			}
			else
			{
				if (!this.hasCapability(`configuration_button.connector${connector}`))
				{
					await this.addCapability(`configuration_button.connector${connector}`);
					await this.addCapability(`left_button.connector${connector}`);
					await this.addCapability(`right_button.connector${connector}`);
				}

				// set the tile for configuration_button.connector
				const capabilityOption = {};
				capabilityOption.title = `${this.homey.__('button')} ${this.homey.__('connector')} ${connector + 1}`;
				this.setCapabilityOptions(`configuration_button.connector${connector}`, capabilityOption);

				capabilityOption.title = `${this.homey.__('button')} ${this.homey.__('connector')} ${connector + 1} ${this.homey.__('left')}`;
				this.setCapabilityOptions(`left_button.connector${connector}`, capabilityOption);

				capabilityOption.title = `${this.homey.__('button')} ${this.homey.__('connector')} ${connector + 1} ${this.homey.__('right')}`;
				this.setCapabilityOptions(`right_button.connector${connector}`, capabilityOption);

				await this.registerCapabilityListener(`configuration_button.connector${connector}`, this.onCapabilityConfiguration.bind(this, connector));
				await this.registerCapabilityListener(`left_button.connector${connector}`, this.onCapabilityLeftButton.bind(this, connector));
				await this.registerCapabilityListener(`right_button.connector${connector}`, this.onCapabilityRightButton.bind(this, connector));

				// await this.syncCapability(connector);
			}
		}
		catch (err)
		{
			this.error(err);
		}
	}

	async onCapabilityDisplayConfiguration(value, opts)
	{
		this.homey.app.updateLog(`onCapabilityConfiguration ${value}, ${opts}`);
		await this.homey.app.uploadDisplayConfiguration(this.ip, value, this.id, this.firmware);
	}

	async onCapabilityConfiguration(connector, value, opts)
	{
		this.homey.app.updateLog(`onCapabilityConfiguration ${connector}, ${value}, ${opts}`);
		await this.uploadOneButtonConfiguration(connector, value);
	}

	async onCapabilityLeftButton(connector, value, opts)
	{
		this.homey.app.updateLog(`onCapabilityLeftButton ${connector}, ${value}, ${opts}`);

		// Setup parameters and call procesButtonClick
		const parameters = {};
		parameters.fromButton = true;
		parameters.buttonCapability = `left_button.connector${connector}`;
		parameters.connector = connector;
		parameters.side = 'left';
		parameters.value = value;
		parameters.configNo = this.getCapabilityValue(`configuration_button.connector${connector}`);
		parameters.connectorType = this.getSetting(`connect${connector}Type`);

		await this.processClickMessage(parameters);
	}

	async onCapabilityRightButton(connector, value, opts)
	{
		this.homey.app.updateLog(`onCapabilityLeftButton ${connector}, ${value}, ${opts}`);
		// Setup parameters and call procesButtonClick
		const parameters = {};
		parameters.fromButton = true;
		parameters.buttonCapability = `right_button.connector${connector}`;
		parameters.connector = connector;
		parameters.side = 'right';
		parameters.value = value;
		parameters.configNo = this.getCapabilityValue(`configuration_button.connector${connector}`);
		parameters.connectorType = this.getSetting(`connect${connector}Type`);

		await this.processClickMessage(parameters);
	}

	async onCapabilityInfo(value, opts)
	{
		this.setCapabilityValue('info', value);
	}

	async checkCoreMQTTMessage(topicParts, value)
	{
		if (topicParts[1] === this.id)
		{
			if (topicParts[2] === 'currentpage')
			{
				this.page = parseInt(value, 10) + 1;
			}
		}
	}

	async processMQTTMessage(topic, MQTTMessage)
	{
		// eslint-disable-next-line eqeqeq
		if (!MQTTMessage || MQTTMessage.id != this.id)
		{
			// Message is not for this device
			return;
		}

		this.homey.app.updateLog(`Panel processing MQTT message: ${topic}`);

		if (MQTTMessage.idx === undefined)
		{
			// If the message has no button number then ignore it as we don't know which button it is for
			this.homey.app.updateLog('The MQTT payload has no connector number');
			return;
		}

		// gather the parameters from various places that we need to process the message
		const parameters = { ...MQTTMessage };
		parameters.connector = (MQTTMessage.idx / 2) | 0;
		parameters.side = (MQTTMessage.idx % 2) === 0 ? 'left' : 'right';
		parameters.connectorType = this.getSetting(`connect${parameters.connector}Type`);
		parameters.configNo = parameters.connectorType === 2 ? this.getCapabilityValue('configuration_display') : this.getCapabilityValue(`configuration_button.connector${parameters.connector}`);
		parameters.buttonCapability = `${parameters.side}_button.connector${parameters.connector}`;

		// Now process the message
		if (topic === 'homey/click')
		{
			// The button was pressed
			this.processClickMessage(parameters);
		}
		else if (topic === 'homey/longpress')
		{
			// The button has been pressed for a long time
			this.processLongPressMessage(parameters);
		}
		else if (topic === 'homey/clickrelease')
		{
			// The button has been released
			this.processReleaseMessage(parameters);
		}
	}

	async processClickMessage(parameters)
	{
		// Check if a large display or if no configuration assigned to this connector
		const config = this.getConfigSide(parameters.configNo, parameters.side);

		if ((parameters.connectorType === 2) || (parameters.configNo === null))
		{
			let { value } = parameters;
			if (!parameters.fromButton)
			{
				// Only do this for on / off capabilities and not dim
				try
				{
					value = !this.getCapabilityValue(parameters.buttonCapability);
					await this.setCapabilityValue(parameters.buttonCapability, value).catch(this.error);

					// and trigger the flow
					if (value)
					{
						this.homey.app.triggerButtonOn(this, parameters.side === 'left', parameters.connector + 1);
					}
					else
					{
						this.homey.app.triggerButtonOff(this, parameters.side === 'left', parameters.connector + 1);
					}
				}
				catch (error)
				{
					this.error(error);
				}
			}

			if (parameters.configNo !== null)
			{
				this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);

				if (config.onMessage !== '' || config.offMessage !== '')
				{
					this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/label`, value && config.onMessage ? config.onMessage : config.offMessage).catch(this.error);
				}
				this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/value`, value).catch(this.error);
			}

			if (parameters.fromButton)
			{
				if (config.onMessage === '')
				{
					// Set the button state back to false immediately
					setImmediate(() =>
					{
						this.setCapabilityValue(parameters.buttonCapability, false).catch(this.error);

						// and trigger the flow
						this.homey.app.triggerButtonOff(this, parameters.side === 'left', parameters.connector + 1);
						if (parameters.configNo !== null)
						{
							this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'released', false);
						}
					});
				}
			}
			return;
		}

		if (config.deviceID === 'customMQTT')
		{
			// we don't handle customMQTT messages
			return;
		}

		let value = 0;

		if (parameters.fromButton || (config.deviceID && config.capabilityName))
		{
			// Check if the button has another device and capability assigned to it
			if (config.deviceID === '_variable_')
			{
				// Variables are read only so just trigger the button flows so they can do the work
				const variable = await this.homey.app.getVariable(config.capabilityName);
				if (variable && variable.type === 'boolean')
				{
					value = !variable.value;

					// Cant't update the variable as the app has missing scopes so a Flow card is required to do this
					// variable.value = value;
					// this.homey.app.setVariable(config.capabilityName, variable);

					// Set the device button state
					this.setCapabilityValue(parameters.buttonCapability, value).catch(this.error);

					if (parameters.configNo !== null)
					{
						this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);
					}

					// and trigger the flow
					if (value)
					{
						this.homey.app.triggerButtonOn(this, parameters.side === 'left', parameters.connector + 1);
					}
					else
					{
						this.homey.app.triggerButtonOff(this, parameters.side === 'left', parameters.connector + 1);
					}
				}

				return;
			}
			if (config.deviceID !== 'none')
			{
				// Find the Homey device that is defined in the configuration
				const homeyDeviceObject = await this.homey.app.getHomeyDeviceById(config.deviceID);
				if (!homeyDeviceObject)
				{
					// Device not found
					this.homey.app.updateLog(`Device ${config.deviceID} not found`);
					return;
				}

				// Find the capability that is defined in the configuration
				const capability = await this.homey.app.getHomeyCapabilityByName(homeyDeviceObject, config.capabilityName);
				if (!capability)
				{
					// Capability not found
					this.homey.app.updateLog(`Capability ${config.capabilityName} not found`);
					return;
				}

				if (config.capabilityName === 'dim')
				{
					if (parameters.configNo !== null)
					{
						this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', true);
					}

					// For dim cpaabilities we need to adjust the value by the amount in the dimChange field and not change the button state
					// Get the required change from the dimChange field and convert it from a percentage to a value
					const change = parseInt(config.dimChange, 10) / 100;
					if ((config.dimChange.indexOf('+') >= 0) || (config.dimChange.indexOf('-') >= 0))
					{
						// + or - was specified so add or subtract the change from the current value
						value = capability.value + change;

						// Make sure the value is between 0 and 1
						if (value > 1)
						{
							value = 1;
						}
						else if (value < 0)
						{
							value = 0;
						}
					}
					else
					{
						// No + or - was specified so just set the value to the change
						value = change;
					}

					// Set the dim capability value of the target device
					homeyDeviceObject.setCapabilityValue(config.capabilityName, value).catch(this.error);
					this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/value`, value * 100).catch(this.error);

					if (parameters.fromButton)
					{
						// Set the button state back to false immediately
						setImmediate(() => this.setCapabilityValue(parameters.buttonCapability, false).catch(this.error));
					}
					return;
				}

				try
				{
					if (config.capabilityName === 'windowcoverings_state')
					{
						value = parameters.fromButton ? parameters.value : !this.getCapabilityValue(parameters.buttonCapability);
						if (parameters.configNo !== null)
						{
							this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);
						}

						if (value)
						{
							await homeyDeviceObject.setCapabilityValue(config.capabilityName, 'up');
						}
						else
						{
							await homeyDeviceObject.setCapabilityValue(config.capabilityName, 'down');
						}
					}
					else
					{
						value = parameters.fromButton ? parameters.value : !capability.value;
						if (parameters.configNo !== null)
						{
							this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);
						}
						await homeyDeviceObject.setCapabilityValue(config.capabilityName, value);
					}
					if (config.onMessage !== '' || config.offMessage !== '')
					{
						this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/label`, value ? config.onMessage : config.offMessage).catch(this.error);
					}
					this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/value`, value).catch(this.error);
				}
				catch (error)
				{
					this.homey.app.updateLog(`Device ${homeyDeviceObject.name}: Capability ${config.capabilityName}, ${error.message}`, 0);
				}
			}
			else
			{
				if (parameters.fromButton)
				{
					value = parameters.value;
				}
				else
				{
					value = !this.getCapabilityValue(parameters.buttonCapability);
				}

				// No capability assigned to this button so just toggle the button
				if (parameters.configNo !== null)
				{
					this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);
				}

				this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/value`, value).catch(this.error);
				if (config.onMessage !== '' || config.offMessage !== '')
				{
					this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/label`, value ? config.onMessage : config.offMessage).catch(this.error);
				}
			}
		}

		if (!parameters.fromButton)
		{
			// Only do this for on / off capabilities and not dim
			try
			{
				const value = !this.getCapabilityValue(parameters.buttonCapability);
				if (parameters.configNo !== null)
				{
					this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'clicked', value);
				}

				// and trigger the flow
				if (value)
				{
					this.homey.app.triggerButtonOn(this, parameters.side === 'left', parameters.connector + 1);
				}
				else
				{
					this.homey.app.triggerButtonOff(this, parameters.side === 'left', parameters.connector + 1);
				}

				await this.setCapabilityValue(parameters.buttonCapability, value).catch(this.error);
			}
			catch (error)
			{
				this.homey.app.updateLog(`Capability ${parameters.buttonCapability}, ${error.message}`, 0);
			}
		}
	}

	async processLongPressMessage(parameters)
	{
		this.longPressOccurred.set(`${parameters.connector}_${parameters.side}`, true);
		this.homey.app.triggerButtonLongPress(this, parameters.side === 'left', parameters.connector + 1);

		if (parameters.configNo !== null)
		{
			const value = this.getCapabilityValue(`${parameters.side}_button.connector${parameters.connector}`);
			this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'long', value);
		}

		if (parameters.configNo !== null)
		{
			const buttonPanelConfiguration = this.homey.app.buttonConfigurations[parameters.configNo];
			const capability = parameters.side === 'left' ? buttonPanelConfiguration.leftCapability : buttonPanelConfiguration.rightCapability;

			if (capability === 'dim')
			{
				// process another click message to change the dim value
				return this.processClickMessage(parameters);
			}
		}

		return null;
	}

	async processReleaseMessage(parameters)
	{
		this.homey.app.triggerButtonRelease(this, parameters.side === 'left', parameters.connector + 1);

		const config = this.getConfigSide(parameters.configNo, parameters.side);

		if (parameters.configNo !== null)
		{
			const value = this.getCapabilityValue(`${parameters.side}_button.connector${parameters.connector}`);
			this.homey.app.triggerConfigButton(this, parameters.side, parameters.connectorType, parameters.configNo, 'released', value);
		}

		// Check if a large display or if no configuration assigned to this connector
		if ((parameters.connectorType === 2) || (parameters.configNo === null))
		{
			if (config.onMessage === '')
			{
				// and trigger the flow
				this.homey.app.triggerButtonOff(this, parameters.side === 'left', parameters.connector + 1);
				await this.setCapabilityValue(parameters.buttonCapability, false).catch(this.error);

				if (config.offMessage !== '')
				{
					this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/label`, config.offMessage).catch(this.error);
				}
				this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${parameters.idx}/value`, false).catch(this.error);
			}
		}
		else if (this.longPressOccurred && this.longPressOccurred.get(`${parameters.connector}_${parameters.side}`) && config.capabilityName === 'windowcoverings_state')
		{
			// Send the pause command to the device if the LongPress was received

			if (config.deviceID === 'customMQTT')
			{
				// we don't handle customMQTT messages
				return;
			}

			if (config.deviceID && config.capabilityName)
			{
				// Check if the button has another device and capability assigned to it
				if (config.deviceID !== 'none')
				{
					// Find the Homey device that is defined in the configuration
					const homeyDeviceObject = await this.homey.app.getHomeyDeviceById(config.deviceID);
					if (!homeyDeviceObject)
					{
						// Device not found
						this.homey.app.updateLog(`Device ${config.deviceID} not found`);
						return;
					}

					// Find the capability that is defined in the configuration
					const capability = await this.homey.app.getHomeyCapabilityByName(homeyDeviceObject, config.capabilityName);
					if (!capability)
					{
						// Capability not found
						this.homey.app.updateLog(`Capability ${config.capabilityName} not found`);
						return;
					}

					try
					{
						await homeyDeviceObject.setCapabilityValue(config.capabilityName, 'idle');
					}
					catch (error)
					{
						this.homey.app.updateLog(`Device ${homeyDeviceObject.name}: Capability ${config.capabilityName}, ${error.message}`);
					}
				}
			}
		}

		if (this.longPressOccurred)
		{
			// Record that the long press has finished
			this.longPressOccurred.set(`${parameters.connector}_${parameters.side}`, false);
		}
	}

	updateGatewayConfig(id, newIp)
	{
		const thisId = this.getSetting('mac');
		if (thisId === id)
		{
			this.setSettings({ address: newIp });
			this.ip = newIp;
		}
	}

	checkGatewayConfig()
	{
		// Check if the IP address has changed by looking up our mac address in the gateway list
		const id = this.getSetting('mac');
		if (id)
		{
			const newIp = this.homey.app.findGatewayIPById(id);
			if (newIp)
			{
				// TODO: update the IP address when mDNS is fixed
				// this.setSettings({ address: newIp });
				// this.ip = newIp;
			}
		}
	}

	async uploadAllButtonConfigurations(deviceConfigurations)
	{
		let writeConfig = false;
		let mqttQue = [];
		if (!deviceConfigurations)
		{
			// download the current configuration from the device
			deviceConfigurations = await this.homey.app.readDeviceConfiguration(this.ip);
			writeConfig = true;
		}

		if (deviceConfigurations)
		{
			// Create a new section configuration for the button panel by adding the core and mqttbuttons sections of the deviceConfigurations to core and mqttbuttons of a new object
			const sectionConfiguration = {
				core: { ...deviceConfigurations.core },
				mqttbuttons: [...deviceConfigurations.mqttbuttons],
			};

			if (sectionConfiguration.mqttbuttons.length < (deviceConfigurations.info.connectors.length * 2))
			{
				// Add the missing mqttbuttons
				for (let i = sectionConfiguration.mqttbuttons.length; i < (deviceConfigurations.info.connectors.length * 2); i++)
				{
					sectionConfiguration.mqttbuttons.push(
					{
						id: i,
						label: `Btn_${i}`,
						toplabel: 'Label',
						topics: [],
					},
);
				}
			}

			for (let i = 0; i < (sectionConfiguration.mqttbuttons.length / 2); i++)
			{
				const connectorType = this.getSetting(`connect${i}Type`);
				let configNo = 0;
				if (this.hasCapability(`configuration_button.connector${i}`))
				{
					// apply the new configuration to this button bar section
					configNo = this.getCapabilityValue(`configuration_button.connector${i}`);
				}

				try
				{
					if (configNo !== null)
					{
						await this.homey.app.applyButtonConfiguration(this.id, connectorType, sectionConfiguration, i, configNo);
						mqttQue = mqttQue.concat(await this.setupConnectorMQTTmessages(configNo, i));
					}
				}
				catch (error)
				{
					this.homey.app.updateLog(error, 0);
				}
			}

			if (writeConfig)
			{
				try
				{
					// write the updated configuration back to the device
					await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
					this.homey.app.updateLog(`Device configuration: ${this.homey.app.varToString(sectionConfiguration)}`);
				}
				catch (error)
				{
					this.homey.app.updateLog(this.homey.app.varToString(error), 0);
				}
			}

			// Send the MQTT messages after a short delay to allow the device to connect to the broker
			setTimeout(async () =>
			{
				for (const mqttMsg of mqttQue)
				{
					this.homey.app.publishMQTTMessage(mqttMsg.brokerId, mqttMsg.message, mqttMsg.value, false).catch(this.error);
				}
			}, 1000);
		}

		return deviceConfigurations;
	}

	async uploadOneButtonConfiguration(connector, configNo)
	{
		let mqttQue = [];

		// Create a new section configuration for the button panel by adding mqttbuttons sections of the deviceConfiguration to a new object
		// Create the framework for the left and right mqttbuttons section
		const sectionConfiguration = {
			mqttbuttons: [
					{},
					{},
				],
		};

		// Add the core section
		sectionConfiguration.core = {};

		const connectorType = this.getSetting(`connect${connector}Type`);
		// eslint-disable-next-line eqeqeq
		if (connectorType == 1)
		{
			try
			{
				mqttQue = mqttQue.concat(await this.homey.app.applyButtonConfiguration(this.id, connectorType, sectionConfiguration, connector, configNo));

				for (const mqttMsg of mqttQue)
				{
					try
					{
						await this.homey.app.publishMQTTMessage(mqttMsg.brokerId, mqttMsg.message, mqttMsg.value, false);
					}
					catch (error)
					{
						this.homey.app.updateLog(error, 0);
					}
				}

				// write the updated configuration back to the device
				await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
			}
			catch (error)
			{
				this.homey.app.updateLog(error, 0);
			}
		}
	}

	async uploadDisplayConfigurations(deviceConfigurations)
	{
		// apply the new display configuration to this unit
		const configNo = this.getCapabilityValue('configuration_display');
		if (configNo)
		{
			try
			{
				if (deviceConfigurations)
				{
					await this.homey.app.applyDisplayConfiguration(deviceConfigurations, configNo, this.id, this.firmware);
				}
				else
				{
					await this.homey.app.uploadDisplayConfiguration(this.ip, configNo, this.id, this.firmware);
				}
			}
			catch (error)
			{
				this.homey.app.updateLog(error, 0);
			}
		}
		else
		{
			let writeConfig = false;
			if (!deviceConfigurations)
			{
				deviceConfigurations = {};
				writeConfig = true;
			}

			deviceConfigurations.mqttdisplays = [
			{
				x: 0,
				y: 0,
				width: 100,
				fontsize: 0,
				align: 0,
				label: this.homey.__('hello1'),
				round: 0,
				topics: [],
			},
			{
				x: 0,
				y: 20,
				width: 100,
				fontsize: 0,
				align: 0,
				label: this.homey.__('hello2'),
				round: 0,
				topics: [],
			},
			{
				x: 0,
				y: 40,
				width: 100,
				fontsize: 0,
				align: 0,
				label: this.homey.__('hello3'),
				round: 0,
				topics: [],
			}];

			if (writeConfig)
			{
				try
				{
					// write the updated configuration back to the device
					await this.homey.app.writeDeviceConfiguration(this.ip, deviceConfigurations);
				}
				catch (error)
				{
					this.homey.app.updateLog(error.message, 0);
				}
			}
		}
	}

	async uploadBrokerConfigurations(deviceConfigurations)
	{
		const sectionConfiguration = await this.homey.app.applyBrokerConfiguration(this.ip);

		if (deviceConfigurations)
		{
			// copy the section configuration to the device configuration
			deviceConfigurations.mqttbroker = sectionConfiguration.mqttbroker;
			return;
		}

		try
		{
			// write the updated configuration back to the device
			await this.homey.app.writeDeviceConfiguration(this.ip, sectionConfiguration);
		}
		catch (error)
		{
			this.homey.app.updateLog(this.homey.app.varToString(error), 0);
		}
	}

	checkStateChange(deviceId, capability, value)
	{
		// check the configuration to see if this capability is being monitored by one of the buttons
		if (this.hasCapability('configuration_button.connector0'))
		{
			this.checkStateChangeForConnector(0, deviceId, capability, value);
		}
		if (this.hasCapability('configuration_button.connector1'))
		{
			this.checkStateChangeForConnector(1, deviceId, capability, value);
		}
		if (this.hasCapability('configuration_button.connector2'))
		{
			this.checkStateChangeForConnector(2, deviceId, capability, value);
		}
		if (this.hasCapability('configuration_button.connector3'))
		{
			this.checkStateChangeForConnector(3, deviceId, capability, value);
		}
		if (this.hasCapability('configuration_button.connector4'))
		{
			this.checkStateChangeForConnector(4, deviceId, capability, value);
		}

		const configNo = this.getCapabilityValue('configuration_display');
		this.checkStateChangeForDisplay(configNo, deviceId, capability, value);
	}

	checkStateChangeForConnector(connector, deviceId, capability, value)
	{
		// Get the configuration for this connector
		const configNo = this.getCapabilityValue(`configuration_button.connector${connector}`);
		if (!configNo)
		{
			// Connector not configured
			return;
		}

		if (capability === 'dim')
		{
			// convert dim value to percentage
			value *= 100;
		}

		// Check the left and right devices and capabilities for this connector
		let side = 'left';
		for (let i = 0; i < 2; i++)
		{
			const config = this.getConfigSide(configNo, side);
			if ((config.deviceID === deviceId) && (config.capabilityName === capability))
			{
				const buttonIdx = connector * 2 + (side === 'left' ? 0 : 1);
				if (config.capabilityName !== 'dim')
				{
					if (config.capabilityName !== 'windowcoverings_state')
					{
						// and trigger the flow
						if (value)
						{
							this.homey.app.triggerButtonOn(this, true, connector + 1);
						}
						else
						{
							this.homey.app.triggerButtonOff(this, true, connector + 1);
						}

						// Set the device button state
						this.setCapabilityValue(`${side}_button.connector${connector}`, value).catch(this.error);
					}
					else
					{
						value = value === 'up';
					}
					if (config.onMessage !== '' || config.offMessage !== '')
					{
						this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${buttonIdx}/label`, value ? config.onMessage : config.offMessage).catch(this.error);
					}
				}

				// Publish to MQTT
				this.homey.app.publishMQTTMessage(config.brokerId, `homey/${this.id}/${buttonIdx}/value`, value).catch(this.error);
			}

			side = 'right';
		}
	}

	checkStateChangeForDisplay(configNo, deviceId, capability, value)
	{
		// Check if configNo is undefined
		if (configNo === undefined)
		{
			// Display not configured
			return;
		}

		// Check the display devices and capabilities for this panel
		const item = this.homey.app.displayConfigurations[configNo];
		if (item)
		{
			for (let itemNo = 0; itemNo < item.items.length; itemNo++)
			{
				const displayItem = item.items[itemNo];
				if ((displayItem.device === deviceId) && (displayItem.capability === capability))
				{
					// Check if the value is different from the last time we published it
					if (displayItem.lastValue !== value)
					{
						displayItem.lastValue = value;

						if (capability === 'dim')
						{
							// convert dim value to percentage
							value *= 100;
						}

						// Publish to MQTT
						const { brokerId } = displayItem;
						this.homey.app.publishMQTTMessage(brokerId, `homey/${deviceId}/${capability}/value`, value).catch(this.error);
					}
				}
			}
		}
	}

	async setupConnectorMQTTmessages(configNo, connector)
	{
		if (configNo === null)
		{
			return [];
		}

		const buttonPanelConfiguration = this.homey.app.buttonConfigurations[configNo];
		if (!buttonPanelConfiguration)
		{
			return [];
		}

		let mqttQue = [];

		mqttQue = mqttQue.concat(await this.publishButtonMQTTmessages(buttonPanelConfiguration, connector * 2));
		mqttQue = mqttQue.concat(await this.publishButtonMQTTmessages(buttonPanelConfiguration, connector * 2 + 1));

		return mqttQue;
	}

	async publishButtonMQTTmessages(buttonPanelConfiguration, buttonIdx)
	{
		const mqttQueue = [];
		let value = '';

		const side = ((buttonIdx & 1) === 0) ? 'left' : 'right';

		const configDevice = buttonPanelConfiguration[`${side}Device`];
		const configCapability = buttonPanelConfiguration[`${side}Capability`];
		const topLabel = buttonPanelConfiguration[`${side}TopText`];
		const labelOn = configCapability === 'dim' ? buttonPanelConfiguration[`${side}DimChange`] : buttonPanelConfiguration[`${side}OnText`];
		const labelOff = buttonPanelConfiguration[`${side}OffText`];
		const brokerId = this.homey.app.getBrokerId(buttonPanelConfiguration[`${side}BrokerId`]);

		// Setup value based on the configuration
		if (configDevice === '_variable_')
		{
			// Get the variable value
			const variable = await this.api.logic.getVariable({ id: configCapability });
			if (variable && variable.type === 'boolean')
			{
				value = variable.value;
			}
		}
		else if (configDevice === 'none')
		{
			value = this.getCapabilityValue(`${side}_button.connector${buttonIdx / 2}`);
		}
		else
		{
			// Get the value from the capability
			try
			{
				const device = await this.homey.app.getHomeyDeviceById(configDevice);
				if (device)
				{
					const capability = await this.homey.app.getHomeyCapabilityByName(device, configCapability);
					if (capability)
					{
						// readOnly = (capability.setable === false);
						// type = capability.type;
						this.homey.app.registerDeviceCapabilityStateChange(device, configCapability);
						value = capability.value;
					}
				}
			}
			catch (err)
			{
				this.homey.app.updateLog(`Error getting device id = ${configDevice}: ${err.message}`, 0);
			}
		}

		// Send the value to the device after a short delay to allow the device to connect to the broker
		mqttQueue.push({
			brokerId,
			message: `homey/${this.id}/${buttonIdx}/value`,
			value,
		});

		// Send the value to the device after a short delay to allow the device to connect to the broker
		mqttQueue.push({
			brokerId,
			message: `homey/${this.id}/${buttonIdx}/toplabel`,
			value: topLabel,
		});

		// Send the value to the device after a short delay to allow the device to connect to the broker
		mqttQueue.push({
			brokerId,
			message: `homey/${this.id}/${buttonIdx}/label`,
			value: value ? labelOn : labelOff,
		});

		return mqttQueue;
	}

	getConfigSide(configNo, side)
	{
		const buttonPanelConfiguration = this.homey.app.buttonConfigurations[configNo];
		if (!buttonPanelConfiguration)
		{
			return {
				deviceID: '',
				capabilityName: '',
				onMessage: '',
				offMessage: '',
				brokerId: 'Default',
				dimChange: 0,
			};
		}

		// Setup which of our buttons (left or right) this message is for
		return {
			deviceID: buttonPanelConfiguration[`${side}Device`],
			capabilityName: buttonPanelConfiguration[`${side}Capability`],
			onMessage: buttonPanelConfiguration[`${side}OnText`],
			offMessage: buttonPanelConfiguration[`${side}OffText`],
			brokerId: buttonPanelConfiguration[`${side}BrokerId`],
			dimChange: buttonPanelConfiguration[`${side}DimChange`],
		};
	}

}

module.exports = PanelDevice;
