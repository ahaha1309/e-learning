require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');
mongoose.connect(process.env.MONGO_URL).then(async () => {
  try {
    const result = await Exam.updateOne(
      { title: 'Kiểm tra Mạng Máy Tính' },
      { $set: { strictMode: true } }
    );
    console.log('Update result:', result);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
});
