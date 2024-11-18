import express from 'express';
import { MongoClient } from 'mongodb';
import mqtt from 'mqtt';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Set up __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
    mqtt: {
        url: 'mqtt://192.168.250.9',
        port: 1883,
        topics: ['iot/temperature', 'iot/humidity']
    },
    mongodb: {
        url: 'mongodb+srv://kbalen9848:r3HJgIvnrpN6Huqr@cluster0.ngus1.mongodb.net/?retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true&appName=Cluster0',
        dbName: 'IOT1',
        collection: 'data'
    },
    server: {
        port: 3000
    }
};

// Express setup
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static('public'));

// Serve the HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket clients tracking
let wsClients = new Set();

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
        const url = `${config.mqtt.url}:${config.mqtt.port}`;
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
        });
    });
};

// Message processing functions
const parseMessage = (topic, message) => {
    try {
        const value = parseFloat(message.toString());
        return {
            topic,
            value,
            sensor: topic.split('/')[1],
            unit: topic.includes('temperature') ? '°C' : '%',
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Message parsing failed:', error);
        return null;
    }
};

const broadcastToWebSocketClients = (data) => {
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

const handleMessage = (saveFunction) => (topic, message) => {
    const parsedData = parseMessage(topic, message);
    if (parsedData) {
        saveFunction(parsedData);
        broadcastToWebSocketClients(parsedData);
    }
};

// WebSocket setup
wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    wsClients.add(ws);

    ws.on('close', () => {
        console.log('Client disconnected');
        wsClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        wsClients.delete(ws);
    });
});

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
        mqttClient.on('error', (error) => {
            console.error('MQTT error:', error);
            mqttClient.end();
        });

        // Start HTTP server
        server.listen(config.server.port, () => {
            console.log(`Server is running on port ${config.server.port}`);
        });

        // Setup graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down...');
            server.close(() => {
                mqttClient.end();
                process.exit();
            });
        });
    } catch (error) {
        console.error('Application setup failed:', error);
        process.exit(1);
    }
};

// Start the application
setupApplication();