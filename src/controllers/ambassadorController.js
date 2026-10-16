import { registerAmbassadorInDb } from '../services/ambassadorService.js';

export async function registerAmbassador(req, res) {
  try {
    const ambassadorData = req.body;
    const pictureFile = req.file;

    const result = await registerAmbassadorInDb(ambassadorData, pictureFile);

    return res.status(201).json({
      success: true,
      message: 'Ambassador registered successfully. Awaiting approval.',
      ambassador: result,
    });
  } catch (error) {
    console.error('Error in registerAmbassador controller:', error.message);
    const status = error.message.includes('already taken') || error.message.includes('already registered')
      ? 409
      : (error.message.includes('required') || error.message.includes('invalid') ? 400 : 500);
    return res.status(status).json({ error: error.message });
  }
}

export default {
  registerAmbassador,
};
