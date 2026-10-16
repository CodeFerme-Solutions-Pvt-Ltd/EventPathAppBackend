import { createTicket } from '../services/ticketService.js';

export async function createTicketController(req, res) {
  try {
    const user = req.user;
    const userId = user?.userId || user?.docId || null;
    const ticketData = req.body;
    const file = req.file;

    const result = await createTicket(userId, ticketData, file);

    return res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully.',
      ticket: result,
    });
  } catch (error) {
    console.error('Error in createTicketController:', error);
    const status = error.message.includes('required') ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Failed to submit ticket.' });
  }
}

export default {
  createTicketController,
};
