const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const documentRoutes = require('./routes/documentRoutes');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected successfully!'))
  .catch(err => console.log('❌ DB Connection Error: ', err));

app.use('/api/documents', documentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`CaseVerity Server running on port ${PORT}`);
});