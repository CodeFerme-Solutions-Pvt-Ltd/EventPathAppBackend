import {
  registerAmbassadorInDb,
  getAllAmbassadors,
  createAmbassadorRequest,
  getAmbassadorRequestStatus,
  checkOrganizationHasAmbassador,
} from '../services/ambassadorService.js';

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

export async function getAllAmbassadorsController(req, res) {
  try {
    const ambassadors = await getAllAmbassadors();
    return res.status(200).json({
      success: true,
      ambassadors,
    });
  } catch (error) {
    console.error('Error in getAllAmbassadorsController:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to fetch ambassadors.' });
  }
}

export async function submitAmbassadorRequestController(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID missing from session.' });
    }

    const { organizationName, department, pictureBase64 } = req.body;
    const pictureFile = req.file;

    const request = await createAmbassadorRequest(
      { userId, organizationName, department, pictureBase64 },
      pictureFile
    );

    return res.status(201).json({
      success: true,
      message: 'Ambassador request submitted successfully.',
      request,
    });
  } catch (error) {
    console.error('Error in submitAmbassadorRequestController:', error.message);
    const status = error.message.includes('required')
      ? 400
      : (error.message.includes('pending') || error.message.includes('already') ? 409 : 500);
    return res.status(status).json({ error: error.message });
  }
}

export async function getAmbassadorRequestStatusController(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User ID missing from session.' });
    }

    const request = await getAmbassadorRequestStatus(userId);
    return res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    console.error('Error in getAmbassadorRequestStatusController:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to fetch request status.' });
  }
}

export async function checkOrganizationAmbassadorController(req, res) {
  try {
    const organizationName = req.query.organizationName || req.query.name;
    if (!organizationName) {
      return res.status(400).json({ error: 'Organization name is required.' });
    }

    const hasAmbassador = await checkOrganizationHasAmbassador(organizationName);
    return res.status(200).json({
      success: true,
      hasAmbassador,
      message: hasAmbassador ? 'Your college already has an ambassador.' : null,
    });
  } catch (error) {
    console.error('Error in checkOrganizationAmbassadorController:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to check organization ambassador.' });
  }
}

export default {
  registerAmbassador,
  getAllAmbassadorsController,
  submitAmbassadorRequestController,
  getAmbassadorRequestStatusController,
  checkOrganizationAmbassadorController,
};
