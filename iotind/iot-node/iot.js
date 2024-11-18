const { MongoClient } = require('mongodb');
const mqtt = require('mqtt');

// Configuration
const config = {
    mqtt: {
        url: 'mqtt://192.168.250.9',
        port: 1883,
        topics: ['iot/temperature', 'iot/humidity']
    },
    mongodb: {
        url: 'mongodb+srv://kbalen9848:r3HJgIvnrpN6Huqr@cluster0.ngus1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
        dbName: 'IOT1',
        collection: 'data'
    }
};
``
// Database functions
const createDbConnection = async () => {
    try {
        const client = await MongoClient.connect(config.mongodb.url);
        const db = client.db(config.mongodb.dbName);
        return db.collection(config.mongodb.collection);
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
};

const saveToDb = (collection) => async (data) => {
    try {
        await collection.insertOne({
            ...data,
            timestamp: new Date()
        });
        console.log('Saved to database:', data);
    } catch (error) {
        console.error('Save failed:', error);
    }
};

// MQTT functions
const createMqttClient = () => {
    try {
        const url  = `${config.mqtt.url}:${config.mqtt.port}`
        const client = mqtt.connect(url);
        console.log('Connecting to MQTT broker:', config.mqtt.url);
        return client;
    } catch (error) {
        console.error('MQTT connection failed:', error);
        throw error;
    }
};

const setupMqttSubscriptions = (client, topics) => {
    topics.forEach(topic => {
        client.subscribe(topic, (error) => {
            if (error) {
                console.error(`Failed to subscribe to ${topic}: `, error);
                return;
            }
            console.log('Subscribed to:', topic);
            console.log(topic)
        });
    });
};

// Message processing functions
const parseMessage = (topic, message) => {
    try {
        console.log("message", message.toString())
        const value = parseFloat(message.toString());
        console.log(topic, message)


        return {
            topic,
            value,
            sensor: topic.split('/')[1],
            unit: topic.includes('temperature') ? '°C' : '%'
        };
    } catch (error) {
        console.error('Message parsing failed:', error);
        return null;
    }
};

const handleMessage = (saveFunction) => (topic, message) => {
    console.log(topic, message)
    const parsedData = parseMessage(topic, message);

    if (parsedData) {
        saveFunction(parsedData);
    }
};

// Error handling
const handleError = (client) => (error) => {
    console.error('MQTT error:', error);
    client.end();
};

// Application setup
const setupApplication = async () => {
    try {
        // Initialize database
        const collection = await createDbConnection();
        const saveFunction = saveToDb(collection);

        // Initialize MQTT
        const mqttClient = createMqttClient();

        // Setup MQTT event handlers
        mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            setupMqttSubscriptions(mqttClient, config.mqtt.topics);
          });
          
        mqttClient.on('message', handleMessage(saveFunction));
        mqttClient.on('error', handleError(mqttClient));

        // Setup graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down...');
            mqttClient.end();
            process.exit();
        });

    } catch (error) {
        console.error('Application setup failed:', error);
        process.exit(1);
    }
};

// Start the application
setupApplication();