import { Router } from "express";
import * as controller from "./invoices.controller";
import * as paymentsController from "../payments/payments.controller";

const router = Router();

// GET   /api/invoices                  - list, ?clientId=&siteId=&status=
//                                         &dateFrom=&dateTo=&page=&pageSize=
// POST  /api/invoices                  - create (clientId + invoiceDate +
//                                         dueDate + amount required; siteId
//                                         optional but must belong to
//                                         clientId if given; invoiceNumber
//                                         auto-generated, status starts
//                                         DRAFT, amountPaid/
//                                         outstandingBalance derived)
// GET   /api/invoices/:id              - view one, includes payments
// PUT   /api/invoices/:id              - edit; locked once CANCELLED;
//                                         amount can't drop below what's
//                                         already been paid
// POST  /api/invoices/:id/issue        - DRAFT -> ISSUED, one-time
// POST  /api/invoices/:id/cancel       - -> CANCELLED, only while
//                                         amountPaid is still 0; terminal
//
// POST  /api/invoices/:id/payments     - record a payment (nested, per
//                                         the same pattern used for
//                                         Attendance under Operations)
// GET   /api/invoices/:id/payments     - list payments for this invoice
//
// Viewing/editing/deleting a single Payment by its own id lives on the
// flat /api/payments/:id router instead.

router.get("/", controller.listInvoices);
router.post("/", controller.createInvoice);
router.get("/:id", controller.getInvoice);
router.put("/:id", controller.updateInvoice);
router.post("/:id/issue", controller.issueInvoice);
router.post("/:id/cancel", controller.cancelInvoice);
router.post("/:id/payments", paymentsController.createPayment);
router.get("/:id/payments", paymentsController.listPaymentsForInvoice);

export default router;
