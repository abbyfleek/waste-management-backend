#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "Sengech's A26";
const char* password = "sengech12";

// Supabase configuration
const char* supabaseUrl = "https://fbpcfpplfetfcjzvgxnc.supabase.co";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZicGNmcHBsZmV0ZmNqenZneG5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2OTczNjEsImV4cCI6MjA1OTI3MzM2MX0.45OHr6JopL31I4PC-d0fV0eHxMPuU1Agfesj56BAjfc";

// Sensor pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

// Distance configuration
const float MAX_DISTANCE = 23.63; // Maximum distance in cm
const float MIN_DISTANCE = 2.0;  // Minimum distance in cm

void setup() {
  Serial.begin(115200);
  
  // Initialize sensor pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
  
  // Test Supabase connection
  testSupabaseConnection();
}

void testSupabaseConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Construct the Supabase URL for a simple query
    String url = String(supabaseUrl) + "/rest/v1/bins?select=count";
    
    http.begin(url);
    
    // Add required headers for Supabase
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", "Bearer " + String(supabaseKey));
    http.addHeader("Content-Type", "application/json");
    
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      Serial.println("HTTP Response code: " + String(httpCode));
      Serial.println("Response: " + payload);
      
      // Parse JSON response
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, payload);
      
      if (httpCode == 200) {
        Serial.println("Successfully connected to Supabase!");
      } else {
        Serial.println("Error connecting to Supabase");
      }
    } else {
      Serial.println("Error on HTTP request");
    }
    
    http.end();
  } else {
    Serial.println("WiFi not connected");
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
  if (distance < MIN_DISTANCE || distance > MAX_DISTANCE) return MAX_DISTANCE;
  return distance;
}

void updateWasteLevel(float distance) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Construct the Supabase URL for updating specific bin
    String url = String(supabaseUrl) + "/rest/v1/bins?bin_id=eq.WPBIN001";
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", "Bearer " + String(supabaseKey));

    // Calculate waste level percentage (using 27cm as max distance)
    int wasteLevel = map(distance, MIN_DISTANCE, MAX_DISTANCE, 100, 0);
    wasteLevel = constrain(wasteLevel, 0, 100);

    // Prepare JSON payload
    StaticJsonDocument<200> doc;
    doc["waste_level"] = wasteLevel;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.PATCH(requestBody);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Supabase response: " + response);
      Serial.println("Distance: " + String(distance) + " cm");
      Serial.println("Updated waste level: " + String(wasteLevel) + "%");
    } else {
      Serial.println("Error sending to Supabase: " + String(httpResponseCode));
    }
    http.end();
  } else {
    Serial.println("WiFi not connected");
  }
}

void loop() {
  float distance = measureDistance();
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  // Send to Supabase
  updateWasteLevel(distance);
  
  // Wait 10 seconds before next reading
  delay(10000);
} 