import { Router } from "express";
import * as controller from "./payments.controller";

const router = Router();

// GET    /api/payments/:id  - view one
// PUT    /api/payments/:id  - edit
// DELETE /api/payments/:id  - remove (a genuine correction — see
//                             payments.service.ts for why Payment, unlike
//                             most models here, supports real deletion)
//
// Create + per-invoice list live on the Invoices router instead
// (POST/GET /api/invoices/:id/payments).

router.get("/:id", controller.getPayment);
router.put("/:id", controller.updatePayment);
router.delete("/:id", controller.deletePayment);

export default router;
