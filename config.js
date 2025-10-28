const path = require('path');
require('dotenv').config({path: path.join(__dirname, 'secret.env')});

module.exports = {
	databaseURL: "mongodb://127.0.0.1:27017/pg-finder",
	baseURL: process.env.BASE_URL,
	emailAdd: process.env.EMAIL_ADDRESS,
	appPass: process.env.APP_PASSCODE,
	port: process.env.PORT || 3500,
	sessionSecret: "myLocalSecretKey",
	zipcodeKey: process.env.ZIPCODE_STACK_KEY,
	cloudName: process.env.CLOUD_NAME,
	cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
	cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
	adminKey: "admin@123",
	stripePrivateKey: process.env.STRIPE_PRIVATE_KEY,
	serverURL: "http://localhost:3500",
};
