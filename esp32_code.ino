#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "Sengech's A26";
const char* password = "sengech12";

// Supabase configuration
const char* supabaseUrl = "https://fbpcfpplfetfcjzvgxnc.supabase.co";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZicGNmcHBsZmV0ZmNqenZneG5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2OTczNjEsImV4cCI6MjA1OTI3MzM2MX0.45OHr6JopL31I4PC-d0fV0eHxMPuU1Agfesj56BAjfc";

// Bin configuration
const char* BIN_ID = "WPBIN001";  // Specific bin ID
const char* BIN_LOCATION = "Main Entrance";  // Bin location

// Sensor pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

// Distance configuration
const float MAX_DISTANCE = 24; // Maximum distance in cm (empty bin)
const float MIN_DISTANCE = 2.0;   // Minimum distance in cm (full bin)

// Variables for averaging readings
const int NUM_READINGS = 5;
float readings[NUM_READINGS];
int readIndex = 0;
float total = 0;
float average = 0;

void setup() {
  Serial.begin(115200);
  
  // Initialize sensor pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Initialize readings array
  for (int i = 0; i < NUM_READINGS; i++) {
    readings[i] = 0;
  }
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.println("\n[WPBIN001] Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WPBIN001] Connected to WiFi");
  Serial.println("[WPBIN001] IP address: " + WiFi.localIP().toString());
  
  // Test Supabase connection
  testSupabaseConnection();
}

void testSupabaseConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Construct the Supabase URL for checking specific bin
    String url = String(supabaseUrl) + "/rest/v1/bins?bin_id=eq." + String(BIN_ID);
    
    http.begin(url);
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", "Bearer " + String(supabaseKey));
    http.addHeader("Content-Type", "application/json");
    
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      Serial.println("[WPBIN001] HTTP Response code: " + String(httpCode));
      Serial.println("[WPBIN001] Response: " + payload);
      
      if (httpCode == 200) {
        Serial.println("[WPBIN001] Successfully connected to Supabase!");
      } else {
        Serial.println("[WPBIN001] Error connecting to Supabase");
      }
    } else {
      Serial.println("[WPBIN001] Error on HTTP request");
    }
    
    http.end();
  } else {
    Serial.println("[WPBIN001] WiFi not connected");
  }
}

float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return MAX_DISTANCE;
  
  float distance = duration * 0.034 / 2;
  if (distance < MIN_DISTANCE || distance > MAX_DISTANCE) {
    Serial.println("[WPBIN001] Invalid distance reading: " + String(distance) + " cm");
    return MAX_DISTANCE;
  }
  
  return distance;
}

float getSmoothedDistance() {
  float distance = measureDistance();
  
  // Subtract the last reading
  total = total - readings[readIndex];
  // Add the new reading
  readings[readIndex] = distance;
  // Add the reading to the total
  total = total + readings[readIndex];
  // Advance to the next position in the array
  readIndex = readIndex + 1;

  // If we're at the end of the array...
  if (readIndex >= NUM_READINGS) {
    readIndex = 0;
  }

  // Calculate the average
  average = total / NUM_READINGS;
  return average;
}

void updateWasteLevel(float distance) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Construct the Supabase URL for updating WPBIN001
    String url = String(supabaseUrl) + "/rest/v1/bins?bin_id=eq." + String(BIN_ID);
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", "Bearer " + String(supabaseKey));
    http.addHeader("Prefer", "return=minimal");  // Add this to get minimal response

    // Calculate waste level percentage
    int wasteLevel = map(distance, MIN_DISTANCE, MAX_DISTANCE, 100, 0);
    wasteLevel = constrain(wasteLevel, 0, 100);

    // Prepare JSON payload
    StaticJsonDocument<200> doc;
    doc["waste_level"] = wasteLevel;
    doc["qr_url"] = "https://waste-management-backend-d3uu.vercel.app/client-dashboard/" + String(BIN_ID);
    doc["last_updated"] = "now()";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.PATCH(requestBody);

    Serial.println("\n[WPBIN001] Updating waste level:");
    Serial.println("  Distance: " + String(distance) + " cm");
    Serial.println("  Waste Level: " + String(wasteLevel) + "%");
    Serial.println("  QR URL: " + String(doc["qr_url"].as<const char*>()));
    Serial.println("  HTTP Response: " + String(httpResponseCode));

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("  Supabase Response: " + response);
      
      if (wasteLevel > 80) {
        Serial.println("  ⚠️ WARNING: Bin is over 80% full!");
      }
    } else {
      Serial.println("  Error sending to Supabase: " + String(httpResponseCode));
    }
    http.end();
  } else {
    Serial.println("[WPBIN001] WiFi not connected");
    // Attempt to reconnect
    WiFi.begin(ssid, password);
  }
}

void loop() {
  float smoothedDistance = getSmoothedDistance();
  updateWasteLevel(smoothedDistance);
  
  // Wait 10 seconds before next reading
  delay(10000);
} 