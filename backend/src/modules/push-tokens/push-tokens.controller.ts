import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { upsertToken, deleteToken } from "./push-tokens.service";

export const registerToken = asyncHandler(async (req: Request, res: Response) => {
  const { token, platform } = req.body as { token?: string; platform?: string };
  if (!token) throw ApiError.badRequest("`token` is required.");

  await upsertToken(req.user!.userId, token, platform ?? "android");
  res.status(200).json({ status: "ok" });
});

export const unregisterToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) throw ApiError.badRequest("`token` is required.");

  await deleteToken(token);
  res.status(200).json({ status: "ok" });
});
