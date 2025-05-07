// HC-SR04 Ultrasonic Sensor Test with ESP32
// Pin definitions
const int TRIG_PIN = 26;  // ESP32 GPIO26 for TRIG
const int ECHO_PIN = 27;  // ESP32 GPIO27 for ECHO

// Variables
long duration;
float distance;

void setup() {
  // Initialize Serial communication
  Serial.begin(115200);
  
  // Set pin modes
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  Serial.println("HC-SR04 Ultrasonic Sensor Test");
  Serial.println("-------------------------------");
}

void loop() {
  // Clear the TRIG_PIN
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  
  // Set the TRIG_PIN HIGH for 10 microseconds
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // Read the ECHO_PIN, return the sound wave travel time in microseconds
  duration = pulseIn(ECHO_PIN, HIGH);
  
  // Calculate the distance
  // Speed of sound wave divided by 2 (go and back)
  // Speed of sound = 343 m/s = 0.0343 cm/microsecond
  distance = duration * 0.0343 / 2;
  
  // Print the distance on the Serial Monitor
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");
  
  // Wait for 1 second before next measurement
  delay(1000);
} 