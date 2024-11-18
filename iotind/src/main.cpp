#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_NeoPixel.h>
#include <DHT.h>
#include <ArduinoJson.h>


// Pin definitions
#define DHT_PIN 17           // GPIO pin connected to the DHT sensor data line
#define DHTTYPE DHT11       // DHT sensor type: DHT11 or DHT22
#define RED_PIN 2           // GPIO pin connected to the Red LED pin
#define GREEN_PIN 0         // GPIO pin connected to the Green LED pin
#define BLUE_PIN 4          // GPIO pin connected to the Blue LED pin

const char* ledColorTopic = "assignment2/ledcolor"; 
const char* ledbrightness = "assignment2/ledcolor"; 
const char* ledTopic = "assignment2/ledcolor"; 
// Temperature thresholds for RGB LED
#define ALARM_COLD 0.0
#define ALARM_HOT 30.0
#define WARN_COLD 10.0
#define WARN_HOT 25.0

// WiFi and MQTT credentials
const char* ssid = "11i HC";
const char* password = "123454321";
const char* mqtt_server = "10.135.180.18";
const int mqtt_port = 1883;

// Set up WiFi and MQTT client
WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHT_PIN, DHTTYPE);

float humidity = 0.0;
float temperature = 0.0;

void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void connectToMQTT() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32Client")) {
      Serial.println("connected");
      client.subscribe(ledTopic);       // Subscribe to LED ON/OFF control topic
      client.subscribe(ledColorTopic);  // Subscribe to RGB LED color control topic
      client.subscribe(ledbrightness);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void publishSensorData() {
  client.publish("iot/temperature", String(temperature).c_str());
  client.publish("iot/humidity", String(humidity).c_str());
}

void setRGBColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}

void updateLEDColor(float temperature) {
  int r = 0, g = 0, b = 0;

  // Set RGB LED color based on temperature
  if (temperature < ALARM_COLD) {
    b = 255; // Blue for cold
  } else if (temperature < WARN_COLD) {
    b = 150; // Light blue for cool
  } else if (temperature <= WARN_HOT) {
    g = 255; // Green for normal
  } else if (temperature < ALARM_HOT) {
    r = 150; g = 150; // Yellow for warm
  } else {
    r = 255; // Red for hot
  }
  setRGBColor(r, g, b);
}

void setup() {
  Serial.begin(115200);
  connectToWiFi();
  
  client.setServer(mqtt_server, mqtt_port);
  connectToMQTT();
  
  dht.begin();
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
}
String ledControl,ledColor,brightness;
void callback(char* topic, byte* message, unsigned int length) {
  String messageTemp;
  for (int i = 0; i < length; i++) {
    messageTemp += (char)message[i];
    
  }

  // Check for LED ON/OFF control messages
  if (String(topic) == ledTopic) {
    ledControl = messageTemp;  // Store the received message for LED ON/OFF control
  }
  // Check for LED color control messages
  if (String(topic) == ledColorTopic) {
    ledColor = messageTemp;    // Store the received message for RGB LED color control
  }
  if (String(topic) == ledbrightness) {
    brightness = messageTemp.toInt();    // Store the received message for RGB LED color control
    Serial.println("brightness:"+brightness);
  }
}
void loop() {
  if (!client.connected()) {
    connectToMQTT();
  }
  client.loop();

  // Read sensor data
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();

  if (!isnan(humidity) && !isnan(temperature)) {
    // Update LED color and publish data
    updateLEDColor(temperature);
    publishSensorData();
  } else {
    Serial.println("Failed to read from DHT sensor!");
  }

  delay(10000);
}