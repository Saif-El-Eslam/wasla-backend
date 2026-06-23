import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { getMyVenueController, setupVenueController, updateMyVenueController } from './venue.controller';
import { setupVenueSchema, updateVenueSchema } from './venue.schemas';

export const venueRouter = Router();

venueRouter.use(requireAuth);

venueRouter.get('/me', getMyVenueController);
venueRouter.post('/setup', validateRequest({ body: setupVenueSchema }), setupVenueController);
venueRouter.patch('/me', validateRequest({ body: updateVenueSchema }), updateMyVenueController);
