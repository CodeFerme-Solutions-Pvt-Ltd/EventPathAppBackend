import { authenticateUser } from '../services/loginService.js';

export async function loginUser(req, res) {
  try {
    const { identifier, password, deviceToken } = req.body;
    const result = await authenticateUser(identifier, password, deviceToken);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      ...result,
    });
  } catch (error) {
    console.error('Error in loginUser controller:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export default {
  loginUser,
};
