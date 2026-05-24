const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log("🔄 Initializing connection to MongoDB Atlas cloud infrastructure...");
    
    // Low timeout thresholds force immediate failures instead of infinite loading hangs
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 4000, 
      connectTimeoutMS: 5000,
    });
    
    console.log(`🚀 MongoDB Connected Successfully to Host: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n======================================================`);
    console.error(`🚨 DETAILED DATABASE CONNECTION DIAGNOSTIC ERROR REPORT`);
    console.error(`======================================================`);
    console.error(`▶️ Error Message : ${error.message}`);
    console.error(`▶️ System Code   : ${error.code || 'UNKNOWN'}`);
    console.error(`▶️ System Call   : ${error.syscall || 'NONE'}`);
    console.error(`▶️ Destination   : ${error.hostname || 'UNKNOWN'}`);
    console.error(`======================================================\n`);
    
    // Auto-Evaluating Root Cause Corruptions
    if (error.message.includes('MongooseServerSelectionError') || error.code === 'ENOTFOUND') {
      console.log("❌ ROOT CAUSE FOUND: NETWORK RESOLUTION FAILURE / PORT BLOCKED");
      console.log("💡 What this means: Your machine cannot find or route traffic to the Atlas cloud clusters.");
      console.log("🛠️  Immediate Fixes:");
      console.log("   1. Switch your system's network adapter to use Google's DNS (8.8.8.8 and 8.8.4.4).");
      console.log("   2. Turn off your Wi-Fi router for a moment and test using your cellular Mobile Hotspot.");
      console.log("   3. Verify you whitelisted IP 0.0.0.0/0 (Access Anywhere) inside MongoDB Atlas.\n");
    } else if (error.message.includes('auth failed') || error.message.includes('AuthenticationFailed')) {
      console.log("❌ ROOT CAUSE FOUND: BAD CREDENTIAL STRINGS");
      console.log("💡 What this means: The connection reached Atlas, but your username or password was rejected.");
      console.log("🛠️  Immediate Fixes:");
      console.log("   1. Check the 'Database Access' tab in Atlas to confirm your Database User password.");
      console.log("   2. Make sure you removed the literal '<' and '>' characters from your .env string.\n");
    } else {
      console.log("❌ ROOT CAUSE FOUND: REJECTED HANDSHAKE");
      console.log("👉 Double check your connection string syntax configurations in your .env file.\n");
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;