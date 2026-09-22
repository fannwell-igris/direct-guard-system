import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./auth.service";
import { parseLogin } from "./auth.validation";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = parseLogin(req.body);
  const result = await service.login(input);
  res.status(200).json({ status: "ok", data: result });
});

// req.user is set by requireAuth, which runs before this handler — see auth.routes.ts.
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.getCurrentUser(req.user!.userId);
  res.status(200).json({ status: "ok", data: user });
});
