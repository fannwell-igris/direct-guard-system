import { Router } from "express";
import * as controller from "./field-visits.controller";
import { uploadVisitAttachment } from "../../middleware/uploadMiddleware";

const router = Router();

// GET    /api/field-visits                 - list, with ?prospectId=&clientId=&marketerId=&dateFrom=&dateTo=&page=&pageSize=
// POST   /api/field-visits                 - create (visitDate defaults to now)
// GET    /api/field-visits/:id             - view one
// PUT    /api/field-visits/:id             - edit
// DELETE /api/field-visits/:id             - hard delete (genuine correction — also removes any attachment file)
//
// Attachment (supporting photo/document):
// POST   /api/field-visits/:id/attachment  - upload or replace (multipart/form-data, field: "file")
// GET    /api/field-visits/:id/attachment  - serve (authenticated, streams the file)
// DELETE /api/field-visits/:id/attachment  - remove

router.get("/", controller.listVisits);
router.post("/", controller.createVisit);
router.get("/:id", controller.getVisit);
router.put("/:id", controller.updateVisit);
router.delete("/:id", controller.deleteVisit);

router.post("/:id/attachment", uploadVisitAttachment.single("file"), controller.uploadAttachment);
router.get("/:id/attachment", controller.serveAttachment);
router.delete("/:id/attachment", controller.deleteAttachment);

export default router;
