const mongoose = require('mongoose');

async function connectDatabase() {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error('MONGO_URL is required before the app can start.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 5000,
  });

  return mongoose.connection;
}

module.exports = {
  connectDatabase,
};
