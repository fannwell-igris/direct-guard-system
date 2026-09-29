import { Router } from "express";
import * as controller from "./quotations.controller";

const router = Router();

// GET   /api/quotations              - list, ?clientId=&siteId=&status=
//                                       &dateFrom=&dateTo=&page=&pageSize=
// POST  /api/quotations              - create (clientId + quotationDate +
//                                       amount required; siteId optional;
//                                       startingNumber optional — overrides
//                                       the running sequence for that year
//                                       so the next auto-number begins there;
//                                       quotationNumber always auto-generated
//                                       server-side, status starts DRAFT)
// GET   /api/quotations/next-number  - peek (doesn't reserve) the number
//                                       the next quotation would get;
//                                       ?date= optional
// GET   /api/quotations/:id          - view one
// PUT   /api/quotations/:id          - edit; only DRAFT quotations may be edited
// POST  /api/quotations/:id/send     - DRAFT → SENT
// POST  /api/quotations/:id/accept   - DRAFT or SENT → ACCEPTED
// POST  /api/quotations/:id/reject   - DRAFT or SENT → REJECTED
// POST  /api/quotations/:id/expire   - DRAFT or SENT → EXPIRED
// DELETE /api/quotations/:id         - hard delete; DRAFT only; ADMIN only
//                                       + password re-confirmation

router.get("/", controller.listQuotations);
router.post("/", controller.createQuotation);
router.get("/next-number", controller.peekNextQuotationNumber);
router.get("/:id", controller.getQuotation);
router.put("/:id", controller.updateQuotation);
router.post("/:id/send", controller.sendQuotation);
router.post("/:id/accept", controller.acceptQuotation);
router.post("/:id/reject", controller.rejectQuotation);
router.post("/:id/expire", controller.expireQuotation);
router.delete("/:id", controller.deleteQuotation);

export default router;
