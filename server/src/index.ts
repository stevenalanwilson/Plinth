import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api';

const app = express();
const port = process.env.PORT ?? '3001';

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', apiRouter);

app.listen(Number(port), () => {
  console.log(`Server running on port ${port}`);
});
