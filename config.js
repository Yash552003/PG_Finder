// config.js (replace existing)
const path = require('path');

// Load .env if present (local dev). In production Render will use env vars set in the service settings.
require('dotenv').config({ path: path.join(__dirname, process.env.SECRET_ENV || 'secret.env') });

const databaseURL = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.DATABASE || "mongodb://127.0.0.1:27017/pg-finder";

module.exports = {
  databaseURL,
  baseURL: process.env.BASE_URL || "http://localhost:3500",
  emailAdd: process.env.EMAIL_ADDRESS,
  appPass: process.env.APP_PASSCODE,
  port: process.env.PORT || 3500,
  sessionSecret: process.env.SESSION_SECRET || "myLocalSecretKey",
  zipcodeKey: process.env.ZIPCODE_STACK_KEY,
  cloudName: process.env.CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  adminKey: process.env.ADMIN_KEY || "admin@123",
  stripePrivateKey: process.env.STRIPE_PRIVATE_KEY,
  serverURL: process.env.SERVER_URL || "http://localhost:3500",
};
