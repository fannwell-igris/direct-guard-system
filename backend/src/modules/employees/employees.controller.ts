import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as employeesService from "./employees.service";
import {
  parseEmployeeCreate,
  parseEmployeeUpdate,
  parseEmploymentStatusUpdate,
  parseListQuery,
} from "./employees.validation";

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeCreate(req.body);
  const employee = await employeesService.createEmployee(input);
  res.status(201).json({ status: "ok", data: employee });
});

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await employeesService.listEmployees(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.getEmployeeById(req.params.id);
  res.status(200).json({ status: "ok", data: employee });
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeUpdate(req.body);
  const employee = await employeesService.updateEmployee(req.params.id, input);
  res.status(200).json({ status: "ok", data: employee });
});

export const updateEmploymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const employmentStatus = parseEmploymentStatusUpdate(req.body);
  const employee = await employeesService.setEmploymentStatus(req.params.id, employmentStatus);
  res.status(200).json({ status: "ok", data: employee });
});

// ---- Photo endpoints ----

export const uploadEmployeePhoto = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest("No photo file received. Send a multipart/form-data request with field name \"photo\".");
  }
  const employee = await employeesService.saveEmployeePhoto(req.params.id, req.file.filename);
  res.status(200).json({ status: "ok", data: employee });
});

export const serveEmployeePhoto = asyncHandler(async (req: Request, res: Response) => {
  const filePath = await employeesService.getEmployeePhotoPath(req.params.id);
  res.sendFile(filePath);
});

export const deleteEmployeePhoto = asyncHandler(async (req: Request, res: Response) => {
  const employee = await employeesService.removeEmployeePhoto(req.params.id);
  res.status(200).json({ status: "ok", data: employee });
});
