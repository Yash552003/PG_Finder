const mongoose = require("mongoose");
const { databaseURL } = require("../config");

mongoose.connect(databaseURL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected successfully"))
.catch((err) => console.error("❌ MongoDB connection error:", err));
