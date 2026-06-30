import { asyncHandler } from '../../common/http/async-handler';
import { ok } from '../../common/http/response';
import { getMyVenue, setupVenue, updateMyVenue } from './venue.service';

export const getMyVenueController = asyncHandler(async (req, res) => {
  const venue = await getMyVenue(req.user);
  ok(res, { venue });
});

export const setupVenueController = asyncHandler(async (req, res) => {
  const venue = await setupVenue(req.user, req.body);
  ok(res, { venue }, 201);
});

export const updateMyVenueController = asyncHandler(async (req, res) => {
  const venue = await updateMyVenue(req.user, req.body);
  ok(res, { venue });
});
