import express from 'express';
import cors from 'cors';

// Route modules
import otpRoute from './routes/otpRoute.js';
import registrationRoute from './routes/registrationRoute.js';
import loginRoute from './routes/loginRoute.js';
import passwordActionsRoute from './routes/passwordActionsRoute.js';
import profileRoute from './routes/profileRoute.js';
import eventRoute from './routes/eventRoute.js';
import starRoute from './routes/starRoute.js';
import ticketRoute from './routes/ticketRoute.js';
import preferencesRoute from './routes/preferencesRoute.js';
import appDataRoute from './routes/appDataRoute.js';
import ambassadorRoute from './routes/ambassadorRoute.js';
import hiringAlertRoute from './routes/hiringAlertRoute.js';

const app = express();

// Standard middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health-check root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    message: 'EventPath AWS Backend API (Lightsail + PostgreSQL) is running.',
    timestamp: new Date().toISOString()
  });
});

// 1. OTP routes
app.use('/api/otp', otpRoute);
app.use('/api/auth', otpRoute); // Fallback for old /auth paths

// 2. Registration routes
app.use('/api/registration', registrationRoute);
app.use('/api/auth', registrationRoute); // Fallback for old /auth paths

// 3. Login routes
app.use('/api/auth', loginRoute);

// 4. Password Actions routes
app.use('/api/auth', passwordActionsRoute);

// 5. Profile routes
app.use('/api/my/profile', profileRoute);

// 6. App configuration & taxonomy routes
app.use('/api/app-data', appDataRoute);

// 7. Event preferences registered BEFORE wildcard event routes to avoid routing clash
app.use('/api/events/preferences', preferencesRoute);

// 8. Event routes
app.use('/api/events', eventRoute);

// 9. Star/Bookmark routes
app.use('/api/stars', starRoute);

// 10. Ticket routes
app.use('/api/tickets', ticketRoute);

// 11. Ambassador routes (Find Ambassadors)
app.use('/api/ambassadors', ambassadorRoute);

// 12. Hiring Alerts routes
app.use('/api/hiring-alerts', hiringAlertRoute);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred on the server.'
  });
});

export default app;
