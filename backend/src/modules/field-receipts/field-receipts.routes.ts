import { Router } from "express";
import * as controller from "./field-receipts.controller";

const router = Router();

// GET  /api/field-receipts             - list, ?status=&siteId=&page=&pageSize=
// POST /api/field-receipts             - Operations logs a receipt ref# + amount in the field
// GET  /api/field-receipts/:id         - view one
// POST /api/field-receipts/:id/reconcile - Finance/Admin marks RECONCILED or DISCREPANCY
//                                          once the physical receipt is in hand

router.get("/", controller.listFieldReceipts);
router.post("/", controller.createFieldReceipt);
router.get("/:id", controller.getFieldReceipt);
router.post("/:id/reconcile", controller.reconcileFieldReceipt);

export default router;
