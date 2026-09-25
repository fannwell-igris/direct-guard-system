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
// GET   /api/invoices/next-number      - peek (doesn't reserve) the number
//                                         the next invoice would get, e.g.
//                                         for a live preview on the New
//                                         Invoice form; ?date= optional
// DELETE /api/invoices                 - wipes EVERY invoice + payment
//                                         (added 2026-09-25, for clearing
//                                         trial/test data). ADMIN only,
//                                         body must be
//                                         { "confirm": "WIPE_ALL_INVOICES",
//                                           "resetNumberingTo"?: number }
//                                         plus the usual password
//                                         re-confirmation.
// GET   /api/invoices/:id              - view one, includes payments
// PUT   /api/invoices/:id              - edit; locked once CANCELLED;
//                                         amount can't drop below what's
//                                         already been paid
// POST  /api/invoices/:id/issue        - DRAFT -> ISSUED, one-time
// POST  /api/invoices/:id/cancel       - -> CANCELLED, only while
//                                         amountPaid is still 0; terminal
// DELETE /api/invoices/:id             - hard delete; only DRAFT/CANCELLED/
//                                         OVERDUE invoices with no payments
//                                         (added 2026-09-25, for clearing out
//                                         trial/test invoices). ADMIN only
//                                         (permissions.ts) + requires the
//                                         requester's own password
//                                         (requireDeleteConfirmation,
//                                         global middleware).
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
router.delete("/", controller.wipeAllInvoices);
router.get("/next-number", controller.peekNextInvoiceNumber);
router.get("/:id", controller.getInvoice);
router.put("/:id", controller.updateInvoice);
router.post("/:id/issue", controller.issueInvoice);
router.post("/:id/cancel", controller.cancelInvoice);
router.delete("/:id", controller.deleteInvoice);
router.post("/:id/payments", paymentsController.createPayment);
router.get("/:id/payments", paymentsController.listPaymentsForInvoice);

export default router;
