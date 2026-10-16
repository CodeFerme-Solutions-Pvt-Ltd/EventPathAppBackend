import { registerUserInDb } from '../services/registrationService.js';

export async function registerUser(req, res) {
  try {
    const userData = req.body;
    if (!userData || typeof userData !== 'object') {
      return res.status(400).json({ error: 'Invalid user registration payload.' });
    }

    const newUser = await registerUserInDb(userData);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: newUser,
    });
  } catch (error) {
    console.error('Error in registerUser controller:', error.message);
    const status = error.message.includes('already taken') || error.message.includes('already registered')
      ? 409
      : 500;
    return res.status(status).json({ error: error.message });
  }
}

export default {
  registerUser,
};
