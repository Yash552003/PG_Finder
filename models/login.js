const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

const loginSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['rider', 'provider', 'admin'], required: true },
  isFilled: { type: Boolean, default: false }
});

loginSchema.plugin(passportLocalMongoose, { usernameField: 'username' });

module.exports = mongoose.model('logins', loginSchema);
